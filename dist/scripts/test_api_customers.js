async function run() {
    const loginRes = await fetch("http://localhost:3001/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@cosmetics.com", password: "admin" })
    });
    if (!loginRes.ok) {
        console.error("Login failed", await loginRes.text());
        process.exit(1);
    }
    const loginData = await loginRes.json();
    const token = loginData.data.accessToken;
    const custRes = await fetch("http://localhost:3001/api/v1/users/customers?limit=3", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    const custData = await custRes.json();
    console.log("Customers API response:", JSON.stringify(custData.data.content, null, 2));
}
run();
export {};
