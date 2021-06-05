interface Attachment {
	name: string,
	link: string
}

interface Project {
	objectID: string,
	name: string,
	attachments: Attachment[],
	objectives: string[],
	stats: string[],
	skills: string[],
	href?: string,
	text?: string
}

interface Version {
	major: number,
	minor: number,
	path: number,
}

