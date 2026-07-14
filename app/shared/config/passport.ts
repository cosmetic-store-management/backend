import passport, { Profile } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy, Profile as FacebookProfile } from "passport-facebook";
import { container } from "tsyringe";
import { UserRepository } from "../../contexts/identity/user/user.repository.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "YOUR_FACEBOOK_APP_ID";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "YOUR_FACEBOOK_APP_SECRET";

const verifyCallback = async (
  req: any,
  accessToken: string,
  refreshToken: string,
  profile: Profile | FacebookProfile,
  done: any
) => {
  try {
    const email = profile.emails?.[0]?.value;
    const provider = profile.provider as "google" | "facebook";

    let query: any = { "providers.providerId": profile.id, "providers.provider": provider };
    if (email) {
      query = { $or: [{ email }, query] };
    }

    const userRepo = container.resolve(UserRepository);
    let user = await userRepo.findOneBy(query);

    if (!user) {
      // Create new user
      user = await userRepo.create({
        name: profile.displayName || `${provider} User`,
        email: email || undefined,
        providers: [{ provider, providerId: profile.id }],
        isActive: true,
        role: "customer",
        avatar: profile.photos?.[0]?.value || "",
      });
    } else {
      // User found, check if this provider is linked
      const isLinked = user.providers.some(p => p.provider === provider && p.providerId === profile.id);
      if (!isLinked) {
        user.providers.push({ provider, providerId: profile.id });
        await userRepo.save(user);
      }
    }

    return done(null, user);
  } catch (error) {
    return done(error as Error, false);
  }
};

// === GOOGLE STRATEGY ===
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      passReqToCallback: true,
      proxy: true,
    },
    verifyCallback
  )
);

// === FACEBOOK STRATEGY ===
passport.use(
  new FacebookStrategy(
    {
      clientID: FACEBOOK_APP_ID,
      clientSecret: FACEBOOK_APP_SECRET,
      callbackURL: "/api/auth/facebook/callback",
      profileFields: ["id", "displayName", "photos", "email"],
      passReqToCallback: true,
      proxy: true,
      graphAPIVersion: 'v19.0'
    },
    verifyCallback
  )
);

export default passport;
