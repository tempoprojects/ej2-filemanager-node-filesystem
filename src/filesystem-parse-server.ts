import * as express from 'express'
import * as logger from 'morgan'
import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as Parse from 'parse/node';
import { Request, Response } from 'express'
import { getReadStructure, getDetailsStructure } from './helpers'
import { isValidInstallationId, assertProject } from './express-helpers';
import { getProjectFiles } from './parse-helpers';

Parse.initialize(process.env.PARSE_SERVER_APP_ID || 'tempoProjectsApp');
(Parse as any).serverURL = process.env.PARSE_SERVER_URL || 'https://tempo-projects-api-development.italk.hr/parse';
(Parse as any).masterKey = process.env.PARSE_SERVER_MASTER_KEY || 'tempoProjectsAppMasterKey';

console.log('masterKey', Parse.masterKey);

export default function() {

    const app: express.Express = express()

    console.log('ParseServer as FS starting...');

    app.use(logger('dev'))
    app.use(bodyParser.urlencoded({
        extended: true,
    }));
    app.use(bodyParser.json());
    app.use(cors());

    /**
     * FileManager actions
     */
    app.post('/file-manager/actions', async (req: Request, res: Response) => {

        const project = await assertProject(req, res);
        if (!project) return;

        console.log('project', project);
        console.log('project.attributes', project?.attributes);

        const projectFiles = await getProjectFiles(project);

        console.log('projectFiles', projectFiles);
        projectFiles.forEach(projectFile => {
            console.log('projectFile', projectFile);
            console.log('projectFile.attributes', projectFile?.attributes);
        });

        const action = req.body.action;
        let response;

        if (action === 'read') {
            response = getReadStructure(null);
        }

        if (action === 'details') {
            response = getDetailsStructure(null);
        }

        res.setHeader('Content-Type', 'application/json');
        response = JSON.stringify(response);
        res.json(response);
    });

    /**
     * FileManager - image preview handler
     */
    app.get('/file-manager/image', function (req, res) {
        res.writeHead(400, { 'Content-type': 'text/html' });
        res.end('No such image');
    });

    /**
     * FileManager - file download handler
     */
    app.get('/file-manager/download', function (req, res) {
        res.writeHead(400, { 'Content-type': 'text/html' });
        res.end('No such file to download');
    });

    /**
     * FileManager - file upload handler
     */
    app.get('/file-manager/upload', function (req, res) {
        res.writeHead(400, { 'Content-type': 'text/html' });
        res.end('No such file to upload');
    });

    console.log('ParseServer as FS started.');

    return app;
}
