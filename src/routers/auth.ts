import { Router } from "express";
import passport from "passport";
import controller from "../controllers/controllerdb.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma.js";

const router = Router();
const db = await controller();

// Create uploads directory structure
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}


// Multer setup - store temporarily, rename after DB insert
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const user = req.user;
        const userUploadDir = path.join('uploads', user.id.toString());
        
        // Create user-specific directory if it doesn't exist
        if (!fs.existsSync(userUploadDir)) {
            fs.mkdirSync(userUploadDir, { recursive: true });
        }
        
        cb(null, userUploadDir);
    },
    filename: function (req, file, cb) {
        // Temporary filename
        const tempName = 'temp-' + Date.now() + '-' + Math.random() + path.extname(file.originalname);
        cb(null, tempName);
    }
});


const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});

// Home route
router.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/dashboard');
    } else {
        res.render("home");
    }
});

// Login route
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login',
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/login',
        failureFlash: true
    })
);

// Register route
router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    const { username, password, confirm_password } = req.body;
    try {
        const existingUser = await db.findUserByUsername(username);
        if (existingUser) {
            req.flash('error_msg', 'Username already exists.');
            return res.redirect('/register');
        }

        if(password !== confirm_password) {
            req.flash('error_msg', 'Passwords do not match.');
            return  res.redirect('/register');
        }

        await db.addUser(username, password);
        req.flash('success_msg', 'You are registered and can now log in.');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'An error occurred during registration.');
        res.redirect('/register');
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error(err);
            req.flash('error_msg', 'An error occurred during logout.');
            return res.redirect('/dashboard');
        }
        req.flash('success_msg', 'You are logged out.');
        res.redirect('/login');
    });
});

// Dashboard route (protected)
router.get('/dashboard', ensureAuthenticated, async (req, res) =>  {
    const user = req.user;
    const rootFolder = await db.getRootFolderId(user.id);
    if(!rootFolder) {
        req.flash('error_msg', 'Root folder not found.');
        return res.redirect('/login');
    }
    const subfoldersNames =  getSubfoldersNamesByOrder(rootFolder.subfolders);
    res.render('dashboard', { user: user, rootFolder: rootFolder, subfoldersNames: subfoldersNames });
    
});

router.get('/dashboard/:folderId', ensureAuthenticated, async (req, res) => {
    const user = req.user;
    const folderId = req.params.folderId;
    const folder = await db.getFolder(user.id, folderId);
    if(!folder) {
        req.flash('error_msg', 'Folder not found.');
        return res.redirect('/dashboard');
    }
    const subfoldersNames =  getSubfoldersNamesByOrder(folder.subfolders);
    res.render('dashboard', { user: user, rootFolder: folder, subfoldersNames: subfoldersNames });
    
});

// Helper function to get subfolder names in order

function getSubfoldersNamesByOrder(subfolders: any[],) {
    const namesInOrder: string[] = [];
    subfolders.forEach((folder) => {
        namesInOrder.push(folder.name);
        if (folder.subfolders && folder.subfolders.length > 0) {
            const nestedNames = getSubfoldersNamesByOrder(folder.subfolders);
            namesInOrder.push(...nestedNames);
        }
    });
    return namesInOrder;
}

router.post('/dashboard/create-folder', ensureAuthenticated, async (req, res) => {
    const user = req.user;
    const { parentFolderId, folderName } = req.body;

    try {
        if(!user || user.id == null) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/dashboard');
        }
        const parentFolder = await db.getFolder(user.id, parentFolderId);
        if (!parentFolder) {
            req.flash('error_msg', 'Parent folder not found.');
            return res.redirect('/dashboard');
        }

        await db.addSubfolder(folderName, user.id, parentFolderId);
        req.flash('success_msg', `Folder "${folderName}" created successfully.`);
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        // Check if it's a duplicate folder error
        if (err instanceof Error && err.message.includes('already exists')) {
            req.flash('error_msg', err.message);
        } else {
            req.flash('error_msg', 'An error occurred while creating the folder.');
        }
        res.redirect('/dashboard');
    }
});

router.post('/dashboard/upload-file',
    ensureAuthenticatedAPI,
    upload.array('files'),
    async (req, res) => {
        const user = req.user;
        const {currentFolderId} = req.body;
        const uploadedTempFiles: string[] = [] //Temp files track

        try{
            if(!user || !user.id){
                return res.status(401).json({
                    success: false,
                    message:'User not fount'
                });
            }

            const parentFolder = await db.getFolder(user.id, currentFolderId);
            const files = req.files as Express.Multer.File[];

            if(!parentFolder){
                files?.forEach(file =>{
                    if(fs.existsSync(file.path)){
                        fs.unlinkSync(file.path);
                    }
                })

                return res.status(404).json({
                    success: false,
                    message: 'Parent folder not found'
                })
            }

            if(!files || files.length === 0){
                return res.status(400).json({
                    success:false,
                    message: 'No files uploaded'
                })
            }

            const uploadedFiles = [];

            for(const file of files){
                uploadedTempFiles.push(file.path);

                const newFile = await db.addFile(user.id, currentFolderId, file.originalname, file.path, file.size, file.mimetype);

                const ext = path.extname(file.originalname);
                const nameWithoutExt = path.basename(file.originalname, ext);
                const newFilename = `${nameWithoutExt}-${newFile.id}${ext}`;
                const newPath = path.join(path.dirname(file.path), newFilename);

                fs.renameSync(file.path, newPath);

                await db.updateFile(newFile.id, newPath);

                uploadedFiles.push({
                    id: newFile.id,
                    name: newFile.name,
                    size: newFile.size,
                    mimetype: newFile.mimetype,
                    uploadedAt: newFile.createdAt
                });
            }

            return res.status(200).json({
                success: true,
                message: `${files.length} file(s) uploaded successfully.`,
                files: uploadedFiles,
                folderId: currentFolderId
            });
        }
        catch(err){
            console.error('Upload error:', err);
            
            // Cleanup: Delete any uploaded temp files on error
            uploadedTempFiles.forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (cleanupErr) {
                        console.error('Error cleaning up file:', cleanupErr);
                    }
                }
            });
            
            return res.status(500).json({
                success: false,
                message: 'An error occurred while uploading files.',
                error: err.message
            });
        }
    }
);

// Middleware to ensure user is authenticated
// For regular HTML page requests
function ensureAuthenticated(req: any, res: any, next: any) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error_msg', 'Please log in to view that resource.');
    res.redirect('/login');
}

function ensureAuthenticatedAPI(req: any, res: any, next: any) {
    if (req.isAuthenticated()) {
        return next();
    }
    return res.status(401).json({
        success: false,
        message: 'Please log in to access this resource.'
    });
}


export default router;