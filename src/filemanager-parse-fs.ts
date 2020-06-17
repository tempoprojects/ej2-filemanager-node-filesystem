import * as express from 'express'
import * as logger from 'morgan'
import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as Parse from 'parse/node';
import { Request, Response } from 'express'
import { getReadStructure, getDetailsStructure, getCreateStructure, getExtensionFromFilename, getUpdateStructure } from './filemanager-helpers'
import { assertProject } from './express-helpers';
import {
    getProjectFiles,
    getProjectFile,
    createProjectFileWithoutData,
    createProjectDirectory,
    bufferToParseFile,
    createProjectFile,
    renameProjectFile,
    deleteProjectFile,
    createProjectFileFromExisting,
    recursiveCopyProjectFile,
} from './parse-helpers';
import * as multer from 'multer';
import * as moment from 'moment';

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

        console.log('POST /file-manager/actions started', 'body', req.body);

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

        // FileManager action
        const action = req.body.action;
        // FileManager response
        let response;

        // action at which object (file/directory)
        const objectId = req.body.data && req.body.data[0]?.objectId;
        // object's title
        const title = req.body.name;

        // Parse.User context
        const sessionToken: string = req.query.sessionToken as string;

        // ONLY for copy and move actions (objectId of parent object)
        const targetObjectId = req.body.targetData?.objectId

        if (action === 'read') {
            if (!objectId) {
                const projectFiles = await getProjectFiles(sessionToken, project);
                response = getReadStructure(project, projectFiles);
            } else {
                console.log('parentId', objectId);
                const parent = await getProjectFile(sessionToken, objectId);
                const projectFiles = await getProjectFiles(sessionToken, project, parent);
                response = getReadStructure(parent, projectFiles);
            }
        }

        // Action for getDetails
        if (action === 'details') {
            console.log('objectId', objectId);
            const projectFile = await getProjectFile(sessionToken, objectId);
            response = getDetailsStructure(projectFile, path);
        }

        // Action for copying files
        if (req.body.action === 'copy') {

            let targetParent: Parse.Object;
            // For files/directories at the project root `parent` should be undefined
            if (project.id !== targetObjectId) {
                targetParent = createProjectFileWithoutData(targetObjectId);
            }

            const itemsForCopy = req.body.data || [];

            response = [];

            for (let i = 0; i < itemsForCopy.length; i++) {
                const objectId = itemsForCopy[i]?.objectId;

                if (objectId) {
                    const projectFile = await getProjectFile(sessionToken, objectId);

                    const duplicatedProjectFile = await recursiveCopyProjectFile(sessionToken, project, projectFile, targetParent);

                    // let newProjectFileOrDirectory: Parse.Object;
                    // if (projectFile.get('isFile')) {
                    //     newProjectFileOrDirectory = await createProjectFileFromExisting(sessionToken, projectFile, parent);
                    // } else {
                    //     // newProjectFileOrDirectory = await createProjectDirectory(
                    //     //     sessionToken,
                    //     //     projectFile.get('title'),
                    //     //     projectFile.get('project'),
                    //     //     parent,
                    //     // );

                       
                    // }

                    response.push(getUpdateStructure(duplicatedProjectFile).files);
                }
            }

            response = {
                files: response,
            };
        }
        // Action for move files
        if (req.body.action === 'move') {

            let parent;
            // For files/directories at the project root `parent` should be undefined
            if (project.id !== targetObjectId) {
                parent = createProjectFileWithoutData(targetObjectId);
            }

            const projectFile = await getProjectFile(sessionToken, objectId);
            if (parent) {
                projectFile.set('parent', parent);
            } else {
                projectFile.unset('parent');
            }
            await projectFile.save(null, { sessionToken });

            response = getUpdateStructure(projectFile);
        }
        // Action to create a new folder
        if (req.body.action === 'create') {
            let parent;
            if (objectId) {
                parent = createProjectFileWithoutData(objectId);
            }
            const projectDirectory = await createProjectDirectory(sessionToken, title, project, parent);
            response = getCreateStructure(projectDirectory);
        }
        // Action to remove a file
        if (req.body.action === 'delete') {

            const filesForDelete = req.body.data || [];

            response = [];

            for (let i = 0; i < filesForDelete.length; i++) {
                const fileForDelete = filesForDelete[i];
                const projectFile = await deleteProjectFile(sessionToken, fileForDelete.objectId);
                response.push(getUpdateStructure(projectFile).files);
            }

            response = {
                files: response,
            };
        }
        // Action to rename a file
        if (req.body.action === 'rename') {
            const newTitle = req.body.newName;
            const projectFile = await renameProjectFile(sessionToken, objectId, newTitle);
            response = getUpdateStructure(projectFile);
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

     // Multer to upload the files to the server
    let fileName = [];
    // MULTER CONFIG: to get file photos to temp server storage
    const multerConfig = {
        // specify diskStorage (another option is memory)
        // storage: multer.diskStorage({
        //     // specify destination
        //     destination: function (req, file, next) {
        //         next(null, './');
        //     },

        //     // specify the filename to be unique
        //     filename: function (req, file, next) {
        //         fileName.push(file.originalname);
        //         next(null, file.originalname);
        //     },
        // }),

        storage: multer.memoryStorage(),

        // filter out and prevent non-image files.
        fileFilter: function (req, file, next) {
            next(null, true);
        },

        limits: {
            fieldSize: 100 * 1024 * 1024, // 100MB
        },
    };

    app.post('/file-manager/upload', multer(multerConfig).any(), async (req, res) => {

        res.setHeader('Content-Type', 'application/json');
        const files = req.files;

        const sessionToken: string = req.query.sessionToken as string;

        const project = await assertProject(req, res);
        if (!project) return;

        try {
            req.body.data = JSON.parse(req.body.data);
        } catch (e) {
            console.error(e);

            res.status(400);
            let response: any = { error: { code: 400, message: 'Bad request: please check your request!' }};
            response = JSON.stringify(response);
            return res.json(response);
        }

        const objectId = req.body.data?.objectId;
        const path = req.body.path;
        let title = req.body.data?.name;

        if (!files || !files.length) {
            res.status(401); // to produce error on the UI, it is required to set HTTP status code
            // TODO: check frontend component, it is not possible to produce custom error message
            let response: any = { error: { code: 401, message: 'Unauthorized: please check your credentials!' }};
            response = JSON.stringify(response);
            return res.json(response);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            const extension = getExtensionFromFilename(file.originalname);
            // Do not use parent directory name as filename in the root
            if (path === '/') {
                title = file.originalname;
            } else {
                // Uploaded files in the children directories should have directory name as filename
                title += '.' + extension;
            }
            console.log('title', title);

            const now = moment().utc();
            const filename = `${now.format('f_YYYY-MM-DD_hh-mm-ss_x')}.${extension}`;

            console.log('file', file);
            const parseFile = await bufferToParseFile(sessionToken, filename, Array.from(file.buffer), file.mimtype);
            // console.log('parseFile', parseFile);

            const parent = createProjectFileWithoutData(objectId);
            const projectFile = await createProjectFile(sessionToken, title, project, parent, parseFile, file.size);
            console.log('projectFile', projectFile.id);
            // console.log('projectFile', projectFile.attributes);
        }

        res.status(200);
        res.send('Success');

        console.log(fileName);

        fileName = [];
    });

    console.log('ParseServer as FS started.');

    return app;
}
