import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function queries() {

    const findUserById = async (id: string) => {
        try{
            const user = await prisma.user.findUnique({
                where:{
                    id: id
                }
            });
            return user;
        } catch (error) {
            console.error("Error finding user by ID:", error);
            throw error;
        }
    };
    
    const findUserByUsername = async (name: string) => {
        try{
            const user = await prisma.user.findUnique({
                where:{
                    username: name
                }
            });
            return user;
        } catch (error) {
            console.error("Error finding user by username:", error);
            throw error;
        }
    };

    const addUser = async (username: string, password: string) => {
        try{
            const hashedPassword = await new Promise<string>((resolve, reject) => {
                bcrypt.hash(password, 10, (err, hash) => {
                    if (err)  return reject(err);
                    resolve(hash);
                });
            });

            const user = await prisma.user.create({
                data:{
                    username: username,
                    password: hashedPassword,
                    folders:{
                        create: {  // Use 'create' for nested creation
                            name: 'Root Folder',
                            parentId: null,  // Explicitly set as root folder
                            isRootFolder: true,
                        }
                    
                    }
                }
            });
            return user;
        } catch (error) {
            console.error("Error adding user:", error);
            throw error;
        }
    };

    const getRootFolderId = async (userId: string) => {
        try {
            const rootFolder = await prisma.folder.findFirst({
                where: {
                    userId: userId,
                    parentId: null,  // Root folders have no parent
                    isRootFolder: true
                },
                include: {
                    subfolders: true,
                    files: true,
                }
            });
            return rootFolder;
        } catch (error) {
            console.error("Error getting root folder ID:", error);
            throw error;
        }
    };

    const getFolder = async (userId: string, folderId: string) =>{
        try{
            const folder = await prisma.folder.findFirst({
                where:{
                    id: folderId,
                    userId: userId,
                },
                include:{
                    parent: true,
                    subfolders:{
                        orderBy:{
                            updatedAt: 'desc' // Orders subfolders by updatedAt in descending order
                        }
                    },
                    files:{
                        orderBy:{
                            updatedAt: 'desc' // Orders subfolders by updatedAt in descending order
                        }
                    }
                }

            });
            return folder;
        }catch (error) {
            console.error("Error getting folder:", error);
            throw error;
        }
    };

    const addSubfolder = async (name:string ,userId: string, parentId: string|null) => {
        try {
                
                const allsubFolders = await getAllsubfolders(userId, parentId);
                const duplicate = allsubFolders.find((folder) => folder.name === name);
                if (duplicate) {
                    
                    throw new Error("A subfolder with this name already exists in the parent folder.");
                }
                
                const newSubfolder = await prisma.folder.create({
                    data: {
                        name: name,  // Name of the new subfolder
                        userId: userId,           // User ID to associate with the new subfolder
                        parentId: parentId  // Set parentId to link to the parent folder
                    }
                });
                return newSubfolder;
        } catch (error) {
            console.error("Error adding subfolder:", error);
            throw error;
        }
    };

    const getAllsubfolders = async (userId: string, parentId: string|null) => {
        try{
            const subfolders = await prisma.folder.findMany({
                where:{
                    userId: userId,
                    parentId: parentId
                }
            });
            return subfolders;
        } catch (error) {
            console.error("Error getting subfolders:", error);
            throw error;
        }
    }

    const addFile = async (userId: string, folderId: string, fileName: string, filePath:string, fileSize:number, mimetype:string) =>{
        try{
            const newFile = await prisma.file.create({ 
                data:{
                    name: fileName,
                    path: filePath,
                    userId: userId,
                    folderId: folderId,
                    size: fileSize,
                    mimeType: mimetype
                }
            });
            return newFile;
        } catch (error) {
            console.error("Error adding file:", error);
            throw error;
        }
    }

    const getFile = async (userId: string, fileId: string) =>  {
        try{
            const file = await prisma.file.findFirst({
                where:{
                    id: fileId,
                    userId: userId,
                }
            });
            return file;
        } catch (error) {
            console.error("Error getting file:", error);
            throw error;
        }
    }

    const renameEntryUser = async (entryId: string, type: 'file' | 'folder' ,newName: string) => {
        try{
            const query = {
                where:{
                    id: entryId
                },
                data:{
                    name: newName   
                }
            };

            if(type === 'file'){
                return await prisma.file.update(query);
            }
            else if (type === 'folder'){
                const folder = await prisma.folder.findUnique(
                    {
                        where:{
                            id: entryId
                        }
                    }
                );
                if (folder){
                    if(folder.isRootFolder === true){
                        console.error("Cannot rename root folder");
                        throw new Error("Cannot rename root folder");
                    }
                    if (folder.parentId){
                        await prisma.folder.update({
                            where: {
                                id: folder.parentId
                            },
                            data: {
                                updatedAt: new Date()
                            }
                        });
                    }
                }
                return await prisma.folder.update(query);
            }
        }
        catch (error) {
            console.error("Error renaming entry:", error);
            throw error;
        }
    };

    const deleteEntryUser = async (type: 'file' | 'folder', entryId: string) => {
        try{
            const query = {
                where:{
                    id: entryId
                }
            };

            if(type === 'file'){
                return await prisma.file.delete(query);
            }
            else if (type === 'folder'){
                const foleder = await prisma.folder.findUnique({
                    where:{ id: entryId }
                });
                if(foleder?.isRootFolder === true){
                    console.error("Cannot delete root folder");
                    throw new Error("Cannot delete root folder");
                }
                return await prisma.folder.delete(query);
            }
        }
        catch (error) {
            console.error("Error deleting entry:", error);
            throw error;
        }
    };

    const updateFile = async(fileId: string, newPath: string) => {
        try{
            return await prisma.file.update({
                where:{
                    id: fileId
                },
                data:{
                    path: newPath
                }
            })
        }
        catch(error){
            console.error("Error updating file:", error);
        }
    }

    return{
        findUserById,
        findUserByUsername,
        addUser,
        getRootFolderId,
        getFolder,
        addSubfolder,
        addFile,
        getFile,
        renameEntryUser,
        deleteEntryUser,
        updateFile
    };
}

export default queries;
