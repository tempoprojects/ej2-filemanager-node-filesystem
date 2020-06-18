import { getProject } from './parse-helpers';
import { Request, Response } from 'express'

// export const isValidInstallationId = async (installationId: string, sessionToken: string, res: Response) => {
//     const user = await isAuthenticated(installationId as string, sessionToken as string);
//     if (!user) {
//         console.error('NOT authenticated!', 'installationId', installationId);

//         res.setHeader('Content-Type', 'application/json');
//         // res.status(401); // DO NOT set status code other than 200 to avoid ugly error messages at UI
//         res.json({ error: { code: 401, message: 'Unauthorized: please check your credentials!' }});
//         return;
//     }
//     return user;
// }

export const assertProject = async (req: Request, res: Response) => {

    const qs = req.query;
    // extract Parse Installation ID, Parse.User.current()?.sessionToken & Project shortCode from the query string
    // const installationId = qs.installationId as string;
    const sessionToken = qs.sessionToken as string || req.body.sessionToken as string;
    const projectShortCode = qs.projectShortCode as string || req.body.projectShortCode as string;

    // if (!await isValidInstallationId(installationId, sessionToken, res)) {
    //     return;
    // }

    const project = await getProject(sessionToken, projectShortCode);

    if (!project) {
        console.error('NOT found!', 'projectShortCode', projectShortCode);

        res.setHeader('Content-Type', 'application/json');
        res.json({ error: { code: 404, message: 'Not found: requested project by short code is missing!' }});
        return;
    }

    return project;
}
