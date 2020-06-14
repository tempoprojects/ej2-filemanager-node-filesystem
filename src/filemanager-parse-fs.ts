import * as express from 'express'
import * as logger from 'morgan'
import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as Parse from 'parse/node';
import { Request, Response } from 'express'
import { getReadStructure, getDetailsStructure } from './filemanager-helpers'
import { assertProject } from './express-helpers';
import { getProjectFiles, getProjectFile } from './parse-helpers';

Parse.initialize(process.env.PARSE_SERVER_APP_ID || 'tempoProjectsApp');
(Parse as any).serverURL = process.env.PARSE_SERVER_URL || 'https://tempo-projects-api-development.italk.hr/parse';
(Parse as any).masterKey = process.env.PARSE_SERVER_MASTER_KEY || 'tempoProjectsAppMasterKey';

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

        console.log('POST /file-manager/actions started');

        const project = await assertProject(req, res);
        if (!project) return;

        // console.log('project', project);
        // console.log('project.attributes', project?.attributes);

        const path = req.body.path;
        
        // console.log('projectFiles', projectFiles);
        // projectFiles.forEach(projectFile => {
        //     console.log('projectFile', projectFile);
        //     console.log('projectFile.attributes', projectFile?.attributes);
        // });

        const action = req.body.action;
        let response;

        const objectId = req.body.data && req.body.data[0]?.objectId;
        
        if (action === 'read') {
            if (!objectId) {
                const projectFiles = await getProjectFiles(project);
                response = getReadStructure(project, projectFiles);
            } else {
                console.log('parentId', objectId);
                const parent = await getProjectFile(objectId);
                const projectFiles = await getProjectFiles(project, parent);
                response = getReadStructure(parent, projectFiles);
            }
        }
        
        if (action === 'details') {
            console.log('objectId', objectId);
            const projectFile = await getProjectFile(objectId);
            response = getDetailsStructure(projectFile, path);
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
