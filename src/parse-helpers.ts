import * as Parse from 'parse/node';

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
