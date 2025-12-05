import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import controller from "../controllers/controllerdb.js";

const db = await controller();

async function configurePassport() {
    passport.use(new LocalStrategy(
        async (username, password, done) => {
            try {
                //1. Find user by username
                const user = await db.findUserByUsername(username);

                //2. If user not found, return done with false
                if (!user) {
                    return done(null, false, { message: 'Incorrect username.' });
                }

                //3. Compare passwords
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return done(null, false, { message: 'Incorrect password.' });
                }

                return done(null, user);

                //4. Handle errors
            } catch (err) {
                return done(err);
            }
        }
    ));

    //Serialize user to store in session
    passport.serializeUser((user: any, done) => {
        // Make sure the property name matches your user object
        const id = user.id;
        if (!id) {
            console.error('User object:', user);
            return done(new Error('User ID not found'));
        }
        done(null, id);
    });

    //Deserialize user from session
    passport.deserializeUser(async (id: number, done) => {
        try {
            const user = await db.findUserById(id);
            if (!user) {
                return done(new Error('User not found'));
            }
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
}

export default configurePassport;
