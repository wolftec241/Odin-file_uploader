import { Router } from "express";
import passport from "passport";
import controller from "../controllers/controllerdb.ts";
import multer from "multer";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma.ts";
import { error } from "console";

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

// Add this helper function before your routes
async function buildFolderPath(userId: string, folderId: string) {
    const path = [];
    let currentId = folderId;
    
    while (currentId) {
        const folder = await db.getFolder(userId, currentId);
        if (!folder) break;
        
        path.unshift({
            id: folder.id,
            name: folder.name
        });
        
        currentId = folder.parentId;
    }
    
    return path;
}

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
// Dashboard route (protected)
// Dashboard root route
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    const user = req.user;
    const rootFolder = await db.getRootFolderId(user.id);
    const rootFolderTree = await db.getUserFolderTree(user.id);
    
    if (!rootFolder) {
        req.flash('error_msg', 'Root folder not found.');
        return res.redirect('/login');
    }
    
    const files = await db.getFilesInFolder(user.id,rootFolder.id);
    const subFolders = rootFolder.subfolders || [];
    
    res.render('dashboard', { 
        user: user, 
        correctFolder: rootFolder, 
        rootFolder: rootFolderTree,
        currentFolderId: rootFolder.id,
        currentPath: [{ id: rootFolder.id, name: rootFolder.name }],
        files: files || [],
        subFolders: subFolders
    });
});

// Dashboard folder route
router.get('/dashboard/:folderId', ensureAuthenticated, async (req, res) => {
    const user = req.user;
    const folderId = req.params.folderId;
    const folder = await db.getFolder(user.id, folderId);
    const rootFolderTree = await db.getUserFolderTree(user.id);
    
    if (!folder) {
        req.flash('error_msg', 'Folder not found.');
        return res.redirect('/dashboard');
    }
    
    const currentPath = await buildFolderPath(user.id, folderId);
    const files = await db.getFilesInFolder(user.id,folderId);
    const subFolders = folder.subfolders || [];
    
    res.render('dashboard', { 
        user: user, 
        correctFolder: folder, 
        rootFolder: rootFolderTree,
        currentFolderId: folderId,
        currentPath: currentPath,
        files: files || [],
        subFolders: subFolders
    });
});

// Helper function to get subfolder names in order

router.post('/dashboard/create-folder', 
    ensureAuthenticated, 

    async (req, res) => {
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
        res.redirect(`/dashboard/${parentFolderId}`);
    } catch (err) {
        console.error(err);
        // Check if it's a duplicate folder error
        if (err instanceof Error && err.message.includes('already exists')) {
            req.flash('error_msg', err.message);
        } else {
            req.flash('error_msg', 'An error occurred while creating the folder.');
        }
        res.redirect(`/dashboard/${parentFolderId}`);
    }
});

router.post('/dashboard/upload-file',
    ensureAuthenticatedAPI,
    upload.array('files'),
    async (req, res) => {
        const user = req.user;
        const {currentFolderId} = req.body;
        const uploadedTempFiles: string[] = [];

        try {
            console.log('📁 Upload started for user:', user.id);
            console.log('📂 Target folder:', currentFolderId);

            if(!user || !user.id){
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const files = req.files as Express.Multer.File[];
            console.log('📤 Files received:', files?.length || 0);
            
            if(!files || files.length === 0){
                return res.status(400).json({
                    success: false,
                    message: 'No files uploaded'
                });
            }

            const parentFolder = await db.getFolder(user.id, currentFolderId);
            console.log('📂 Parent folder found:', !!parentFolder);
            
            if(!parentFolder){
                files.forEach(file => {
                    if(fs.existsSync(file.path)){
                        fs.unlinkSync(file.path);
                    }
                });
                
                return res.status(404).json({
                    success: false,
                    message: 'Parent folder not found'
                });
            }

            const uploadedFiles = [];
            
            for(const file of files){
                try {
                    console.log(`\n🔄 Processing file: ${file.originalname}`);
                    uploadedTempFiles.push(file.path);
                    
                    // 1. Save to database
                    console.log('💾 Saving to database...');
                    const newFile = await db.addFile(
                        user.id, 
                        currentFolderId, 
                        file.originalname, 
                        file.path, 
                        file.size, 
                        file.mimetype
                    );
                    console.log('✅ Saved to DB with ID:', newFile.id);
                    
                    // 2. Rename file with DB ID
                    const ext = path.extname(file.originalname);
                    const nameWithoutExt = path.basename(file.originalname, ext);
                    const newFilename = `${nameWithoutExt}-${newFile.id}${ext}`;
                    const newPath = path.join(path.dirname(file.path), newFilename);
                    
                    console.log('📝 Renaming file...');
                    console.log('   From:', file.path);
                    console.log('   To:', newPath);
                    
                    // Check if temp file exists before renaming
                    if(!fs.existsSync(file.path)){
                        throw new Error(`Temp file not found: ${file.path}`);
                    }
                    
                    fs.renameSync(file.path, newPath);
                    console.log('✅ File renamed');
                    
                    // 3. Update database with new path
                    console.log('💾 Updating file path in DB...');
                    await db.updateFile(newFile.id, newPath);
                    console.log('✅ DB updated');
                    
                    uploadedFiles.push({
                        id: newFile.id,
                        name: newFile.name,
                        size: newFile.size,
                        mimeType: newFile.mimeType,
                        uploadedAt: newFile.createdAt
                    });
                    
                } catch (fileError) {
                    console.error(`❌ Error processing file ${file.originalname}:`, fileError);
                    throw fileError; // Re-throw to be caught by outer catch
                }
            }
            
            console.log('\n✅ All files processed successfully');
            
            return res.status(200).json({
                success: true,
                message: `${files.length} file(s) uploaded successfully.`,
                files: uploadedFiles,
                folderId: currentFolderId
            });
            
        } catch(err) {
            console.error('❌ Upload error:', err);
            console.error('Error stack:', err.stack);
            
            // Cleanup temp files on error
            console.log('🧹 Cleaning up temp files...');
            uploadedTempFiles.forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                        console.log('🗑️  Deleted:', filePath);
                    } catch (cleanupErr) {
                        console.error('Error cleaning up file:', cleanupErr);
                    }
                }
            });
            
            // Only send error response if we haven't sent success response
            if (!responseSent) {
                return res.status(500).json({
                    success: false,
                    message: 'An error occurred while uploading files.',
                    error: err.message
                });
            } else {
                console.error('⚠️  Error occurred AFTER success response was sent!');
            }
        }
    }
);

router.delete('/dashboard/file/:fileId', ensureAuthenticatedAPI, async (req: any, res: any) => {
    const user = req.user;
    const fileId = req.params.fileId;
    
    try{
        await db.deleteEntryUser('file', fileId, user.id);
        res.json({
            success:true,
            message: 'File deleted successfully'
        });
    }catch(err){
        console.error('Delete file error:', err);
        res.status(500).json({
            success:false,
            message: err.message || 'Failed to delete file'
        });
    }
});

// Delete folder route
router.delete('/dashboard/folder/:folderId', ensureAuthenticatedAPI, async (req, res) => {
    const user = req.user;
    const { folderId } = req.params;
    
    try {
        await db.deleteEntryUser('folder', folderId, user.id);
        res.json({ 
            success: true, 
            message: 'Folder and all contents deleted successfully' 
        });
    } catch (err) {
        console.error('Delete folder error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message || 'Failed to delete folder' 
        });
    }
});

// Add this route after your delete routes
router.get('/dashboard/download-file/:fileId', ensureAuthenticated, async (req, res) => {
    const user = req.user;
    const { fileId } = req.params;
    
    try {
        // Get file from database
        const file = await db.getFile(user.id, fileId);
        
        if (!file) {
            req.flash('error_msg', 'File not found.');
            return res.redirect('/dashboard');
        }
        
        // Verify ownership
        if (file.userId !== user.id) {
            req.flash('error_msg', 'Unauthorized access.');
            return res.redirect('/dashboard');
        }
        
        // Check if physical file exists
        if (!fs.existsSync(file.path)) {
            req.flash('error_msg', 'File not found on disk.');
            return res.redirect('/dashboard');
        }
        
        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Length', file.size.toString());
        
        // Create read stream and pipe to response
        const fileStream = fs.createReadStream(file.path);
        
        fileStream.on('error', (error) => {
            console.error('Error streaming file:', error);
            if (!res.headersSent) {
                res.status(500).send('Error downloading file');
            }
        });
        
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Download error:', error);
        req.flash('error_msg', 'An error occurred while downloading the file.');
        res.redirect('/dashboard');
    }
});


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