import * as Parse from 'parse/node';

const Project = Parse.Object.extend('Project');
const ProjectFile = Parse.Object.extend('ProjectFile');

// export const isAuthenticated = async (installationId: string, sessionToken: string): Promise<Parse.Object | undefined> => {
//     const query = new Parse.Query(Parse.Session);
//     query.equalTo('installationId', installationId);
//     query.equalTo('sessionToken', sessionToken);
//     console.time('isAuthenticated query.first');
//     const session: Parse.Session = await query.first({ useMasterKey: true });
//     console.timeEnd('isAuthenticated query.first');
//     console.log('session', session);
//     try {
//         const user = session?.get('user');
//         console.log('user', user);

//         await user.fetch({ useMasterKey: true });
//         console.log('user.attributes', user.attributes);

//         return user;
//     } catch (e) {
//         console.error('isAuthenticated.user', e);
//         return;
//     }
// }

export const getProject = async (sessionToken: string, projectShortCode: string) => {
    const query = new Parse.Query(Project);
    query.equalTo('shortCode', projectShortCode);
    console.time('getProject query.first');
    // const project = await query.first({ useMasterKey: true });
    const project = await query.first({ sessionToken });
    console.timeEnd('getProject query.first');
    return project;
}

export const getProjectFiles = async (sessionToken: string, project: Parse.Object, parent?: Parse.Object) => {
    const query = new Parse.Query('ProjectFile');
    query.equalTo('project', project);
    query.doesNotExist('deletedAt'); // Do not show soft deleted files
    if (parent) {
        // files/dirs in subdirectories
        query.equalTo('parent', parent);
    } else {
        // files/dirs in the root
        query.doesNotExist('parent');
    }
    console.time('getProjectFiles query.find')
    // const projectFiles = await query.find({ useMasterKey: true });
    const projectFiles = await query.find({ sessionToken });
    console.timeEnd('getProjectFiles query.find')
    return projectFiles;
}

export const getProjectFile = async (sessionToken: string, objectId: string) => {
    const query = new Parse.Query('ProjectFile');
    query.equalTo('objectId', objectId);
    console.time('getProjectFile query.first');
    // const projectFile = await query.first({ useMasterKey: true });
    const projectFile = await query.first({ sessionToken });
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

    if (parent?.id) {
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
    sessionToken: string,
    title: string,
    project: Parse.Object,
    parent?: Parse.Object,
    file?: Parse.File,
    size?: number,
) => {
    const projectFile = buildProjectFile(title, project, parent, file, size);
    console.time('createProjectFile.save');
    await projectFile.save(null, { sessionToken });
    console.timeEnd('createProjectFile.save');
    return projectFile;
}

export const createProjectFileFromExisting = async (
    sessionToken: string,
    project: Parse.Object,
    projectFile: Parse.Object,
    parent?: Parse.Object,
) => {

    const newProjectFile = await createProjectFile(
        sessionToken,
        projectFile.get('title'),
        project,
        parent,
        projectFile.get('file'),
        projectFile.get('size'),
    );
    return newProjectFile;
}

export const createProjectDirectoryFromExisting = async (
    sessionToken: string,
    project: Parse.Object,
    projectDirectory: Parse.Object,
    parent?: Parse.Object,
) => {

    const newProjectDirectory = await createProjectDirectory(
        sessionToken,
        projectDirectory.get('title'),
        project,
        parent,
    );
    return newProjectDirectory;
}

export const bufferToParseFile = async (sessionToken: string, name: string, buffer: any, contentType: string) => {
    const file: any = new Parse.File(name, buffer, contentType);
    return await file.save({ sessionToken });
}

export const buildProjectDirectory = (title: string, project: Parse.Object, parent?: Parse.Object) => {
    const projectDirectory = buildProjectFile(title, project, parent);
    projectDirectory.set('isFile', false); // Every directory is not a file
    return projectDirectory;
}

export const createProjectDirectory = async (sessionToken: string, title: string, project: Parse.Object, parent?: Parse.Object) => {
    const projectDirectory = buildProjectDirectory(title, project, parent);
    console.log('projectDirectory', projectDirectory);
    console.log('projectDirectory.attributes', projectDirectory.attributes);
    console.time('createProjectDirectory.save');
    await projectDirectory.save(null, { sessionToken });
    console.timeEnd('createProjectDirectory.save');
    return projectDirectory;
}

export const renameProjectFile = async (sessionToken: string, objectId: string, newTitle: string) => {
    const projectFile = await getProjectFile(sessionToken, objectId);
    projectFile.set('title', newTitle);
    console.time('renameProjectFile.save');
    projectFile.save(null, { sessionToken });
    console.timeEnd('renameProjectFile.save');
    return projectFile;
}

export const deleteProjectFile = async (sessionToken: string, objectId: string) => {
    const projectFile = await getProjectFile(sessionToken, objectId);
    projectFile.set('deletedAt', new Date());
    console.time('deleteProjectFile.save');
    projectFile.save(null, { sessionToken });
    console.timeEnd('deleteProjectFile.save');
    return projectFile;
}

export const recursiveCopyProjectFile = async (
    sessionToken: string,
    project: Parse.Object,
    object: Parse.Object,
    targetParent: Parse.Object,
    level = 0,
) => {

    console.log('recursiveWalkProjectDirectory.level', level)

    if (object.get('isFile')) {
        const newProjectFile = await createProjectFileFromExisting(sessionToken, project, object, targetParent);
        return newProjectFile;
    } else {
        const newProjectDirectory = await createProjectDirectoryFromExisting(sessionToken, project, object, targetParent);
        const projectFiles = await getProjectFiles(sessionToken, project, object);

        for (let i = 0; i < projectFiles.length; i++) {
            const projectFile = projectFiles[i];
            console.log('projectFile.title', projectFile.get('title'));
            await recursiveCopyProjectFile(sessionToken, project, projectFile, newProjectDirectory, level + 1);
        }
        return newProjectDirectory;
    }

}


