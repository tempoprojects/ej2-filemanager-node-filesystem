export const parseObjectToFileManagerNode = (obj: Parse.Object): FileManagerNode => {

    let type = '.bin';
    const file: Parse.File = obj?.attributes?.file;
    if (file?.name()?.includes('.')) {
        type = '.' + file.name()?.split('.')?.pop();
    }

    return {
        name: obj?.attributes?.shortTitle || obj?.attributes?.title,
        isFile: obj?.attributes?.isFile,
        size: obj?.attributes?.isFile ? obj?.attributes?.size || 1024 : null,
        dateModified: obj?.attributes?.updatedAt,
        dateCreated: obj?.attributes?.createdAt,
        hasChild: !obj?.attributes?.isFile,
        type,
        filename: obj?.attributes?.title.endsWith(type) ? obj?.attributes?.title : obj?.attributes?.title + type,
        url: obj?.attributes?.file?.url(),

        objectId: obj?.id,
    }
}

export const getExtensionFromFilename = (filename: string) => {
    if (filename?.includes('.')) {
        return filename?.split('.')?.pop() || 'bin';
    }
    return 'bin';
}

export const getReadStructure = (parent: Parse.Object, children: Parse.Object[], root: Parse.Object): ReadStructure => {

    const rootName = `[${root.get('shortCode')}] ${root.get('shortTitle')}`;

    const cwd: FileManagerNode = parseObjectToFileManagerNode(parent);
    cwd.rootName = rootName;

    const files: FileManagerNode[] = children.map(obj => {
        const fileManagerNode = parseObjectToFileManagerNode(obj);
        fileManagerNode.rootName = rootName;
        return fileManagerNode;
    });

    const structure: ReadStructure = {
        cwd,
        files,
        // error: {
        //     code: 401,
        //     message: 'Some error',
        // },
    };

    return structure;
}

export const getDetailsStructure = (obj: Parse.Object, path: string): DetailsStructure => {

    const fmNode = parseObjectToFileManagerNode(obj);

    let size = fmNode.size === null ? '' : fmNode.size + ' B';
    if (fmNode.size > 1024) {
        size = Math.round(fmNode.size / 1024) + ' KB';
    }
    if (fmNode.size > (1024 * 1024)) {
        size = Math.round(fmNode.size / (1024 * 1024)) + ' MB';
    }

    const structure: DetailsStructure = {

        details: {
            name: fmNode.name,
            size,
            isFile: fmNode.isFile,
            modified: fmNode.dateModified,
            created: fmNode.dateCreated,
            type: fmNode.type,
            location: path,
        },
    };

    return structure;
}

export const getCreateStructure = (obj: Parse.Object): CreateStructure => {
    return {
        files: parseObjectToFileManagerNode(obj),
    }
}

export const getUpdateStructure = (obj: Parse.Object): UpdateStructure => {
    return getCreateStructure(obj);
}

// ReadStructure
export interface FileManagerNode {
    name: string;
    isFile: boolean;
    size: number | null;
    dateModified: string;
    dateCreated: string;
    hasChild: boolean;
    type: string;
    filename: string;
    url: string;
    rootName?: string;

    objectId: string;
}

export interface Error {
    code: number;
    message: string;
}

export interface ReadStructure {
    cwd: FileManagerNode;
    files: FileManagerNode[];
    error?: Error;
}

// DetailsStructure
export interface Details {
    name: string;
    size: string;
    isFile: boolean;
    modified: string;
    created: string;
    type: string;
    location: string;
}

export interface DetailsStructure {
    details: Details;
}

// CreateStructure
export interface CreateStructure {
    files: FileManagerNode
}
// UpdateStructure
export interface UpdateStructure extends CreateStructure {
}
