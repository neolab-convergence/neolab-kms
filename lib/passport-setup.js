const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { writeLog } = require('./logger');
const { isAdminEmail, isSuperAdmin } = require('./auth');

function setupPassport() {
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user, done) => done(null, user));

    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: 'http://localhost:3000/auth/google/callback',
        proxy: true
    }, async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails[0].value;
        const domain = email.split('@')[1];
        if (domain !== process.env.ALLOWED_DOMAIN) {
            writeLog('AUTH', `도메인 거부: ${email}`, `domain=${domain}`);
            return done(null, false, { message: '허용되지 않은 도메인입니다.' });
        }
        const admin = await isAdminEmail(email);
        writeLog('AUTH', `로그인 성공: ${email}`, `admin=${admin} superAdmin=${isSuperAdmin(email)}`);
        return done(null, {
            id: profile.id,
            email: email,
            name: profile.displayName,
            photo: profile.photos[0]?.value,
            isAdmin: admin,
            isSuperAdmin: isSuperAdmin(email)
        });
    }));
}

module.exports = { setupPassport };
