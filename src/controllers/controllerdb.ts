import queries from  "../db/queries.ts";
import bcrypt from "bcrypt";

const controller = async () => {
    const db = await queries();

    const findUserById = async (id: string) => {
        return await db.findUserById(id);
    }

    const findUserByUsername = async (colName: string) => {
        return await db.findUserByUsername(colName);
    };

    const addUser = async (username: string, password: string) => {
        return await db.addUser(username, password);
    };
    
    const getRootFolderId = async (userId: string) => {
        return await db.getRootFolderId(userId);
    };

    const getFolder = async (userId: string, folderId: string) => {
        return await db.getFolder(userId, folderId);
    };

    const addSubfolder = async (name: string,userId: string, parentId: string | null) => {
        return await db.addSubfolder(name, userId, parentId);
    }

    const getAllsubfolders = async (userId: string, parentId: string | null) => {
        return await db.getAllsubfolders(userId, parentId);
    }

    const getUserFolderTree = async (userId: string) => {
        return await db.getUserFolderTree(userId);
    }

    const addFile = async (userId: string, folderId: string, fileName: string, filePath: string, fileSize: number, mimeType: string) => {
        return await db.addFile(userId, folderId, fileName, filePath, fileSize, mimeType);
    }

    const getFile = async (userId: string, fileId: string) => {
        return await db.getFile(userId, fileId);
    }

    const renameEntryUser = async (entryId: string, entryType: 'file' | 'folder', newName: string) => {
        return await db.renameEntryUser(entryId, entryType, newName);
    }

    const deleteEntryUser = async (entryType: 'file' | 'folder', entryId: string, userId: string) => {
        return await db.deleteEntryUser(entryType, entryId, userId);
    }

    const updateFile = async(fileId: string, newPath: string) =>{
        return await db.updateFile(fileId, newPath);
    }

    const getFilesInFolder = async(userId: string, folderId: string) => {
        return await db.getFilesInFolder(userId, folderId);
    }

    return {
        findUserById,
        findUserByUsername,
        addUser,
        getRootFolderId,
        getFolder,
        addSubfolder,
        getAllsubfolders,
        getUserFolderTree,
        addFile,
        getFile,
        renameEntryUser,
        deleteEntryUser,
        updateFile,
        getFilesInFolder
    };  

}

export default controller;