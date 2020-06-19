import * as express from 'express'
import * as logger from 'morgan'
import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as Parse from 'parse/node';
import { Request, Response } from 'express'
import {
    getReadStructure,
    getDetailsStructure,
    getCreateStructure,
    getExtensionFromFilename,
    getUpdateStructure,
    parseObjectToFileManagerNode,
    getReadStructureProjectFileTemplate,
} from './filemanager-helpers'
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
    recursiveCopyProjectFile,
    recursiveGetProjectFile,
    getProjectFileTemplates,
    getProjectFileTemplate,
    createProjectFileTemplateWithoutData,
    createProjectFileTemplate,
    deleteProjectFileTemplate,
    renameProjectFileTemplate,
    recursiveApplyProjectFileTemplateToProjectFile,
} from './parse-helpers';
import * as multer from 'multer';
import * as moment from 'moment';
import * as request from 'request';
import { zipURLs } from './file-helpers';

// Connect to ParseServer
Parse.initialize(process.env.PARSE_SERVER_APP_ID);
(Parse as any).serverURL = process.env.PARSE_SERVER_URL;
// (Parse as any).masterKey = process.env.PARSE_SERVER_MASTER_KEY;

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
     * Apply ProjectFileTemplate subtree to the ProjectFile as subtree of new ProjectFile(s) directories
     */
    app.post('/filemanager/apply', async (req: Request, res: Response) => {

        // Valid Project is required
        const project = await assertProject(req, res);
        if (!project) return;

        // Parse.User context
        const sessionToken: string = req.query.sessionToken as string || req.body.sessionToken as string;

        // Source
        const projectFileTemplateObjectId = req.body.projectFileTemplateObjectId;
        // Target
        const projectFileObjectId = req.body.projectFileObjectId;

        const projectFileTemplate = await getProjectFileTemplate(sessionToken, projectFileTemplateObjectId);
        let projectFile;
        // If !projectFileObjectId apply to the root with parent undefined
        if (projectFileObjectId) {
            projectFile = await getProjectFile(sessionToken, projectFileObjectId);
        }

        await recursiveApplyProjectFileTemplateToProjectFile(sessionToken, projectFileTemplate, projectFile, project);

        const response = {
            code: 200,
            message: 'Recursive ProjectFileTemplate apply to ProjectFile is successfully done!',
        };

        res.setHeader('Content-Type', 'application/json');
        res.json(response);
    });

    /**
     * FileManager templates - CRUD for ProjectFileTemplate objects which are subtrees
     * which can be applyed to any directory (ProjectFile with isFile === false), this is the smart multiple NewFolder action
     */
    app.post('/filemanager/templates', async (req: Request, res: Response) => {

        console.log('POST /filemanager/templates started', 'query', req.query, 'body', req.body);

        // Parse.User context
        const sessionToken: string = req.query.sessionToken as string;

        // FileManager action
        const action = req.body.action;
        // FileManager response
        let response;

        // action at which object (directory)
        const objectId = req.body.data && req.body.data[0]?.objectId;

        // object's title
        const title = req.body.name;

        // ONLY for copy and move actions (objectId of parent object)
        const targetObjectId = req.body.targetData?.objectId

        if (action === 'read') {

            let parent;
            let projectFileTemplates;
            if (!objectId) {
                // objects at root
                projectFileTemplates = await getProjectFileTemplates(sessionToken);
            } else {
                // objects at subdir
                parent = await getProjectFileTemplate(sessionToken, objectId);
                projectFileTemplates = await getProjectFileTemplates(sessionToken, parent);
            }

            response = getReadStructureProjectFileTemplate(parent, projectFileTemplates);
        }

        if (action === 'search') {
            const searchString = req.body.searchString.substr(1, req.body.searchString.length - 2);
            let parent: Parse.Object;
            if (objectId) {
                parent = createProjectFileTemplateWithoutData(objectId);
            }
            const projectFileTemplates = await getProjectFileTemplates(sessionToken, parent, searchString);
            response = getReadStructureProjectFileTemplate(parent, projectFileTemplates);
        }

        if (req.body.action === 'move') {

            let parent;
            // For files/directories at the project root `parent` should be undefined
            if (targetObjectId) {
                // parent = createProjectFileTemplateWithoutData(targetObjectId);
                parent = await getProjectFileTemplate(sessionToken, targetObjectId);
            }

            const itemsForMove = req.body.data || [];

            response = [];

            for (let i = 0; i < itemsForMove.length; i++) {
                const objectId = itemsForMove[i].objectId;
                const projectFileTemplate = await getProjectFileTemplate(sessionToken, objectId);

                console.log('projectFileTemplate', projectFileTemplate);
                console.log('projectFileTemplate.attributes', projectFileTemplate.attributes);

                if (parent) {
                    console.log('projectFileTemplate.parent', parent);
                    projectFileTemplate.set('parent', parent);
                } else {
                    projectFileTemplate.unset('parent');
                }
                await projectFileTemplate.save(null, { sessionToken });

                response.push(getUpdateStructure(projectFileTemplate).files);
            }

            response = {
                files: response,
            };
        }
        // Action to create a new object
        if (req.body.action === 'create') {
            let parent;
            if (objectId) {
                parent = createProjectFileTemplateWithoutData(objectId);
                // parent = getProjectFileTemplate(sessionToken, objectId);
            }
            const projectFileTemplate = await createProjectFileTemplate(sessionToken, title, parent);
            console.log('projectFileTemplate.created', projectFileTemplate);
            response = getCreateStructure(projectFileTemplate);
        }
        // Action to remove a object
        if (req.body.action === 'delete') {

            const itemsForDelete = req.body.data || [];

            response = [];

            for (let i = 0; i < itemsForDelete.length; i++) {
                const itemForDelete = itemsForDelete[i];
                const projectFileTemplate = await deleteProjectFileTemplate(sessionToken, itemForDelete.objectId);
                response.push(getUpdateStructure(projectFileTemplate).files);
            }

            response = {
                files: response,
            };
        }
        // Action to rename a object
        if (req.body.action === 'rename') {
            const newTitle = req.body.newName;
            const projectFileTemplate = await renameProjectFileTemplate(sessionToken, objectId, newTitle);
            response = getUpdateStructure(projectFileTemplate);
        }

        res.setHeader('Content-Type', 'application/json');
        response = JSON.stringify(response);
        res.json(response);
    });

    /**
     * FileManager actions - CRUD for ProjectFile objects for specific Project object
     */
    app.post('/filemanager/actions', async (req: Request, res: Response) => {

        console.log('POST /filemanager/actions started', 'query', req.query, 'body', req.body);

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
        console.log('sessionToken', sessionToken);

        // ONLY for copy and move actions (objectId of parent object)
        const targetObjectId = req.body.targetData?.objectId

        if (action === 'read') {
            if (!objectId) {
                const projectFiles = await getProjectFiles(sessionToken, project);
                response = getReadStructure(project, projectFiles, project);
                response.cwd.name = '[' + project.get('shortCode') + '] ' + response.cwd.name;
                response.cwd.isRoot = true;
            } else {
                console.log('parentId', objectId);
                const parent = await getProjectFile(sessionToken, objectId);
                const projectFiles = await getProjectFiles(sessionToken, project, parent);
                response = getReadStructure(parent, projectFiles, project);
            }
        }

        if (action === 'search') {
            const searchString = req.body.searchString.substr(1, req.body.searchString.length - 2);
            let parent: Parse.Object;
            if (objectId && project.id !== objectId) {
                parent = createProjectFileWithoutData(objectId);
            }
            const projectFiles = await getProjectFiles(sessionToken, project, parent, searchString);
            response = getReadStructure(project, projectFiles, project);
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

            const itemsForMove = req.body.data || [];

            response = [];

            for (let i = 0; i < itemsForMove.length; i++) {
                const objectId = itemsForMove[i].objectId;
                const projectFile = await getProjectFile(sessionToken, objectId);
                if (parent) {
                    projectFile.set('parent', parent);
                } else {
                    projectFile.unset('parent');
                }
                await projectFile.save(null, { sessionToken });

                response.push(getUpdateStructure(projectFile).files);
            }

            response = {
                files: response,
            };
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
    app.get('/filemanager/image', function (req, res) {

        console.log('POST /filemanager/image started', 'body', req.body);

        res.writeHead(400, { 'Content-type': 'text/html' });
        res.end('No such image');
    });

    /**
     * FileManager - file download handler
     */
    app.post('/filemanager/download', async (req, res) => {

        console.log('/filemanager/download', 'query', req.query, 'body', req.body);

        const sessionToken = req.query.sessionToken as string;
        // const objectId = req.body.downloadInput?.objectId;

        // const projectFile = await getProjectFile(sessionToken, objectId);
        // const fileManagerNode = parseObjectToFileManagerNode(projectFile);

        const downloadInput = JSON.parse(req.body.downloadInput);

        const data = downloadInput?.data || [];
        const path = downloadInput?.path;

        if (!data?.length) {
            return res.json({ message: 'data in downloadInput is missing'});
        }

        if (data.length === 1 && data[0].isFile) {

            for (let i = 0; i < data?.length; i++) {

                const fileManagerNode = downloadInput?.data[i];

                const filename = fileManagerNode?.filename;
                const url = fileManagerNode?.url;

                console.log('filename', filename, 'url', url);

                if (!filename || !url) {
                    // res.writeHead(404, { 'Content-type': 'text/html' });
                    res.setHeader('Content-Disposition', `attachment`);
                    return res.end('No such file');
                }

                res.setHeader('Content-Disposition', `attachment; filename=${filename}; filename*=UTF-8`);
                request(url).pipe(res);
            }
        } else {

            const files = [];
            const rootName = downloadInput?.data[0]?.rootName;

            // Sort createdAt DESC because older files should be added later with appended dateCreated in the filename
            data.sort((a, b) => {
                if (a.dateCreated < b.dateCreated) { return 1; } return -1;
            });

            for (let i = 0; i < data?.length; i++) {

                const fileManagerNode = downloadInput?.data[i];
                const isRoot = downloadInput?.data[i]?.isRoot;

                const objectId = fileManagerNode?.objectId;
                const filename = fileManagerNode?.filename;
                const name = fileManagerNode?.name;
                const type = fileManagerNode?.type;
                const url = fileManagerNode?.url;
                const dateModified = fileManagerNode?.dateModified;
                const dateCreated = fileManagerNode?.dateCreated;

                // Empty directories should not be included in the ZIP, and directories will be created implicity
                if (fileManagerNode?.isFile) {
                    files.push({ url, filename, path, name, type, objectId, dateModified, dateCreated, rootName });
                }

                const fetchProjectFile = async (projectFile) => {
                    const children = await recursiveGetProjectFile(sessionToken, projectFile);

                    for (let j = 0; j < children.length; j++) {
                        const child = children[j];
                        console.log('child.path', child.get('path'));
                        console.log('child.title', child.get('title'));

                        if (child.get('isFile')) {

                            const childAsFileManagerNode = parseObjectToFileManagerNode(child);
                            files.push({
                                url: childAsFileManagerNode.url,
                                filename: childAsFileManagerNode.filename,
                                path: child.get('path'),
                                objectId: child.id,
                                name: childAsFileManagerNode.name,
                                type: childAsFileManagerNode.type,
                                dateModified: childAsFileManagerNode.dateModified,
                                dateCreated: childAsFileManagerNode.dateCreated,
                                rootName,
                            })
                        }
                    }

                    console.log('children', children);
                }

                if (isRoot) {
                    const project = await assertProject(req, res);
                    if (project) {
                        const projectFiles = await getProjectFiles(sessionToken, project);

                        for (let j = 0; j < projectFiles.length; j++) {
                            const projectFile = projectFiles[j];
                            await fetchProjectFile(projectFile);
                        }
                    }
                } else {

                    if (objectId && !fileManagerNode.isFile) {
                        const projectFile = await getProjectFile(sessionToken, objectId);
                        await fetchProjectFile(projectFile);
                    }
                }
            }

            const now = moment().utc();
            const archiveFilename = `${rootName}_DOWNLOAD_${now.format('YYYY-MM-DD_hh-mm-ss')}.zip`;
            res.setHeader('Content-Disposition', `attachment; filename=${archiveFilename}; filename*=UTF-8`);
            // res.header('Transfer-Encoding', '');
            zipURLs(files, res);

            console.log('download.done');
        }
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

    app.post('/filemanager/upload', multer(multerConfig).any(), async (req, res) => {

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
