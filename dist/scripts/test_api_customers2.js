import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env") });
const payload = {
    id: "665a3cf5728eb52cf5a10d00", // fake admin id
    role: "admin",
    permissions: ["customers.view"]
};
const token = jwt.sign(payload, process.env.JWT_SECRET || "fallback_secret", { expiresIn: "1h" });
async function run() {
    try {
        const res = await fetch("http://127.0.0.1:3001/api/users/customers", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if (!res.ok) {
            console.log("Error:", res.status, await res.text());
            return;
        }
        const body = await res.json();
        console.log("Response success:", body.success);
        if (body.data && body.data.content) {
            const firstUser = body.data.content[0];
            console.log("First user:", firstUser.name, firstUser.province);
            const xuan = body.data.content.find((u) => u.name === "Xuân Lạc Đào");
            if (xuan) {
                console.log("Xuân Lạc Đào province:", xuan.province);
            }
            else {
                console.log("Xuân Lạc Đào not found in first page.");
            }
        }
    }
    catch (err) {
        console.error(err);
    }
}
run();
