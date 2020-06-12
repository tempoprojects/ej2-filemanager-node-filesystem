import * as Parse from 'parse/node';

export const isAuthenticated = async (installationId: string) => {
    const query = new Parse.Query(Parse.Session);
    query.equalTo('installationId', installationId);
    const session: Parse.Session = await query.first({ useMasterKey: true });
    return !!session;
}

export const getProject = async (projectShortCode: string) => {
    const query = new Parse.Query('Project');
    query.equalTo('shortCode', projectShortCode);
    const project = await query.first({ useMasterKey: true });
    return project;
}

export const getProjectFiles = async (project: Parse.Object) => {
    const query = new Parse.Query('ProjectFile');
    query.equalTo('project', project);
    const projectFiles = await query.find({ useMasterKey: true });
    return projectFiles;
}
