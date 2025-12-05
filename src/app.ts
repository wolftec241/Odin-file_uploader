import 'dotenv/config';
import expressSession from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import  { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import configurePassport from './config/passport.js';
import express from 'express';
import passport from 'passport';
import flash from 'connect-flash';
import authRoutes from './routers/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function main() {
    const app = express();
    const PORT = process.env.SERVER_PORT || 3000;
    

    // Set view engine
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    app.use(express.urlencoded({ extended: true }));
    // serve static files from project-root/public (was pointing to src/public)
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(express.json());

    app.use(
    expressSession({
        secret: process.env.SESSION_SECRET || 'default_secret',
        resave: true,
        saveUninitialized: true,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
        maxAge: 7 * 24 * 60 * 60 * 1000 // ms
        },
        store: new PrismaSessionStore(
            new PrismaClient(),
            {
                checkPeriod: 2 * 60 * 1000,  //ms
                dbRecordIdIsSessionId: true,
                dbRecordIdFunction: undefined,
            }
        )
    })
    );

    app.use(passport.initialize());
    app.use(passport.session());    

    // Configure Passport strategies
    configurePassport();

    //Flash middleware
    app.use(flash());
    app.use((req, res, next) => {
        res.locals.success_msg = req.flash('success_msg');
        res.locals.error_msg = req.flash('error_msg');
        res.locals.error = req.flash('error');
        next();
    });

    //Routes
    app.use('/', authRoutes);

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}


main().catch((err) => {
    console.error("Error starting the application:", err);
});


