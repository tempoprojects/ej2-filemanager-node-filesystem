import * as Parse from 'parse/node';

const Project = Parse.Object.extend('Project');
const ProjectFile = Parse.Object.extend('ProjectFile');

export const isAuthenticated = async (installationId: string) => {
    const query = new Parse.Query(Parse.Session);
    query.equalTo('installationId', installationId);
    console.time('isAuthenticated query.first');
    const session: Parse.Session = await query.first({ useMasterKey: true });
    console.timeEnd('isAuthenticated query.first');
    return !!session;
}

export const getProject = async (projectShortCode: string) => {
    const query = new Parse.Query('Project');
    query.equalTo('shortCode', projectShortCode);
    console.time('getProject query.first');
    const project = await query.first({ useMasterKey: true });
    console.timeEnd('getProject query.first');
    return project;
}

export const getProjectFiles = async (project: Parse.Object, parent?: Parse.Object) => {
    const query = new Parse.Query('ProjectFile');
    query.equalTo('project', project);
    if (parent) {
        // files/dirs in subdirectories
        query.equalTo('parent', parent);
    } else {
        // files/dirs in the root
        query.doesNotExist('parent');
    }
    console.time('getProjectFiles query.find')
    const projectFiles = await query.find({ useMasterKey: true });
    console.timeEnd('getProjectFiles query.find')
    return projectFiles;
}

export const getProjectFile = async (objectId: string) => {
    const query = new Parse.Query('ProjectFile');
    query.equalTo('objectId', objectId);
    console.time('getProjectFile query.first');
    const projectFile = await query.first({ useMasterKey: true });
    console.timeEnd('getProjectFile query.first');
    return projectFile;
}

export const createProjectFileWithoutData = (objectId: string) => {
    return ProjectFile.createWithoutData(objectId);
}

export const buildProjectFile = (
    title: string,
    project: Parse.Object,
    parent?: Parse.Object,
    file?: Parse.File,
    size?: number,
) => {
    const projectFile = new ProjectFile();
    projectFile.set('title', title);
    projectFile.set('project', project);
    projectFile.set('isFile', true);

    const acl = new Parse.ACL();
    acl.setRoleReadAccess('PROJECT_' + project.get('shortCode'), true);
    acl.setRoleReadAccess('EMPLOYEE', true);
    acl.setRoleWriteAccess('EMPLOYEE', true);
    projectFile.setACL(acl);

    if (parent) {
        // DO NOT set project pointer to parent if directory is created at the root of project files in that case parent should be undefined
        if (parent.id !== project.id) {
            projectFile.set('parent', parent);
        }
    }

    if (file) {
        projectFile.set('file', file);
        projectFile.set('size', size);
    }

    return projectFile;
}

export const createProjectFile = async (
    title: string,
    project: Parse.Object,
    parent?: Parse.Object,
    file?: Parse.File,
    size?: number,
) => {
    const projectFile = buildProjectFile(title, project, parent, file, size);
    console.time('createProjectFile.save');
    projectFile.save();
    console.timeEnd('createProjectFile.save');
    return projectFile;
}

export const bufferToParseFile = async (name: string, buffer: any, contentType: string) => {
    const file = new Parse.File(name, buffer, contentType);
    return await file.save();
}

export const buildProjectDirectory = (title: string, project: Parse.Object, parent?: Parse.Object) => {
    const projectDirectory = buildProjectFile(title, project, parent);
    projectDirectory.set('isFile', false); // Every directory is not a file
    return projectDirectory;
}

export const createProjectDirectory = async (title: string, project: Parse.Object, parent?: Parse.Object) => {
    const projectDirectory = buildProjectDirectory(title, project, parent);
    console.time('createProjectDirectory.save');
    await projectDirectory.save();
    console.timeEnd('createProjectDirectory.save');
    return projectDirectory;
}

export const renameProjectFile = async (objectId: string, newTitle: string) => {
    const projectFile = await getProjectFile(objectId);
    projectFile.set('title', newTitle);
    console.time('renameProjectFile.save');
    projectFile.save();
    console.timeEnd('renameProjectFile.save');
    return projectFile;
}


