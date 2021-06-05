import algoliasearch from 'algoliasearch';
const client = algoliasearch(process.env.ALGOLIA_APP_ID as string, process.env.ALGOLIA_API_KEY as string);
const index = client.initIndex('projects');
index.setSettings({
	searchableAttributes: [
		'name'
	]
});
export default index;
