import * as fs from 'fs';
import puppeteer from 'puppeteer';
import './lib/env';
import path from 'path';
import { exec } from 'child_process';
import client from './lib/algolia';
import { differenceWith, isEqual, find } from 'lodash';

const cached = JSON.parse(fs.readFileSync('data/projects.json', 'utf8'));
let changelog = fs.readFileSync(path.resolve(__dirname, '../CHANGELOG.md'), 'utf-8').split('\n').slice(1).join('\n');
const repo = 'https://github.com/dalexhd/42-norminette';

if (typeof process.env.USERNAME === 'undefined' || typeof process.env.PASSWORD === 'undefined') {
	console.log('Please set the USERNAME/PASSWORD env value at .env file.');
	process.exit(1);
}

(async () => {
	const browser = await puppeteer.launch({
		headless: false
	});
	const page = await browser.newPage();
	const getStats = async function (): Promise<string[]> {
		await page.waitForSelector('#projects_registrations_stats p span');
		const stats: string[] = await page.evaluate(() => {
			const _stats: string[] = [];
			$.each($('#projects_registrations_stats p span'), function () {
				const text = $(this).get(0).innerText.trim();
				if (text !== '') _stats.push(text);
			});
			return _stats;
		});
		return stats;
	};

	await page.goto('https://intra.42.fr/');
	// Type into search box.
	await page.type('input[name="user[login]"]', process.env.USERNAME as string);
	await page.type('input[type=password]', process.env.PASSWORD as string);
	await Promise.all([
		page.click('input[type="submit"]'),
		page.waitForNavigation({ waitUntil: 'networkidle0' }),
	]);
	await page.goto('https://projects.intra.42.fr/projects/list');
	await page.click('button[data-cursus="21"]');
	await page.waitForSelector('ul.projects-list--list.list');
	const projects = await page.evaluate(() => {
		const projects: Attachment[] = [];
		$.each($('ul.projects-list--list.list li.project-item'), function () {
			const link = $(this).find('div.project-name a');
			projects.push({
				link: link.attr('href') as string,
				name: link.text()
			});
		});
		return projects;
	});
	if (typeof cached.projects === 'undefined') {
		cached.projects = [];
	}
	if (typeof cached.version === 'undefined') {
		cached.version = 'v0.0.0';
	}
	const version = cached.version.match(/v([0-9]+).([0-9]+).([0-9]+)/);
	const data = {
		version: {
			major: parseInt(version[1]),
			minor: parseInt(version[2]),
			path: parseInt(version[3]),
		} as Version,
		projects: [] as Project[]
	};
	let cachedVersion = {
		major: parseInt(version[1]),
		minor: parseInt(version[2]),
		path: parseInt(version[3]),
	} as Version;
	for (let i = 0; i < projects.length; i++) {
		console.log(`[${i}/${projects.length}] Visiting: https://projects.intra.42.fr${projects[i].link}`);
		await page.goto(`https://projects.intra.42.fr${projects[i].link}`);
		const project: Project = {
			objectID: projects[i].name,
			name: projects[i].name,
			href: `https://projects.intra.42.fr${projects[i].link}`,
			attachments: await page.evaluate(() => {
				const _attachments: Attachment[] = [];
				$.each($('.attachment-name a'), function () {
					_attachments.push({
						link: $(this).attr('href') as string,
						name: $(this).text()
					});
				});
				return _attachments;
			}),
			objectives: await page.evaluate(() => {
				return $.map($('.skill-list').eq(0), function (e) {
					// @ts-ignore
					return e.textContent.split('\n').filter(el => el !== '');
				});
			}),
			skills: await page.evaluate(() => {
				return $.map($('.skill-list').eq(1), function (e) {
					// @ts-ignore
					return e.textContent.split('\n').filter(e => e !== '');
				});
			}),
			stats: await getStats()
		};
		data.projects[i] = project;
	}

	const deleted: Project[] = [];
	cached.projects.forEach((cachedproject, index) => {
		if (!find(data.projects, { objectID: cachedproject.objectID })) {
			deleted.push(cachedproject);
			cached.projects.splice(index, 1);
		}
	});
	const added: Project[] = [];
	data.projects.forEach(freshproject => {
		if (!find(cached.projects, { objectID: freshproject.objectID })) {
			added.push(freshproject);
		}
	});
	const modified: Project[] = differenceWith(cached.projects, data.projects, isEqual);
	let changelogContent = '';
	if (deleted.length > 0) {
		data.version.major += 1;
		data.version.minor = 0;
		data.version.path = 0;
		changelogContent += '\n\n:boom: Deleted Projects:\n';
		deleted.forEach(data => {
			console.log('Deleted ' + data.objectID);
			changelogContent += `\n- ${data.objectID}: ${data.href}`;
		});
		client.deleteObjects(deleted.map(a => a.objectID));
	}
	if (added.length > 0) {
		if (cachedVersion.major == data.version.major) {
			data.version.minor += 1;
			data.version.path = 0;
		}
		changelogContent += '\n\n:rocket: New Projects:\n';
		added.forEach(data => {
			console.log('Added ' + data.objectID);
			changelogContent += `\n- ${data.objectID}: ${data.href}`;
		});
		client.saveObjects(added);
	}
	if (modified.length > 0) {
		if (cachedVersion.major == data.version.major && cachedVersion.minor == data.version.minor) {
			data.version.path += 1;
		}
		changelogContent += '\n\n:wrench: Updated Projects:\n';
		modified.forEach(data => {
			console.log('Modified ' + data.objectID);
			changelogContent += `\n- ${data.objectID}: ${data.href}`;
		});
		client.partialUpdateObjects(modified);
	}

	// @ts-ignore
	data.version = `v${data.version.major}.${data.version.minor}.${data.version.path}`;
	// @ts-ignore
	cachedVersion = `v${cachedVersion.major}.${cachedVersion.minor}.${cachedVersion.path}`;
	changelog = `# Changelog

## [${data.version}](${repo}/tree/${data.version}) (${new Date().toISOString().split('T')[0]})

[Full Changelog](${repo}/compare/${cachedVersion}...${data.version})${changelogContent}
${changelog}`;
	if (deleted.length > 0 || added.length > 0 || modified.length > 0) {
		await fs.writeFileSync(path.resolve(__dirname, '../CHANGELOG.md'), changelog);
		await fs.writeFileSync('data/projects.json', JSON.stringify(data, undefined, 1));
		// @ts-ignore
		//await exec('lerna version ' + data.version.substring(1) + ' --no-git-tag-version --no-push --yes');
		// @ts-ignore
		await exec('cd ../ yarn version --new-version ' + data.version.substring(1) + ' --no-git-tag-version');
		setTimeout(async() => {
			await exec('git add --all');
			// @ts-ignore
			await exec('git commit -m "feat(scrapper): Update to version ' + data.version + '"');
			await exec('git push');
			await exec('git tag ' + data.version);
			await exec('git push --tags');
			await fs.writeFileSync(path.resolve(__dirname, '../RELEASE-CHANGELOG.md'), changelogContent);
			console.log('::set-output name=tag_released::false');
			//console.log('::set-output name=tag_released::true');
			//await exec('echo "app_version=' + data.version + '" >> $GITHUB_ENV');
		}, 1000);
	} else {
		console.log('::set-output name=tag_released::false');
	}
	await browser.close();
})();



