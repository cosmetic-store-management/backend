import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
function capitalizeFirstLetter(string) {
    if (!string)
        return string;
    return string.charAt(0).toUpperCase() + string.slice(1);
}
async function capitalizeNames() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();
        // Process Products
        const products = await db.collection('products').find({}).toArray();
        let productUpdates = 0;
        const productOps = [];
        for (const p of products) {
            if (p.name && p.name.length > 0) {
                const newName = capitalizeFirstLetter(p.name);
                if (newName !== p.name) {
                    productOps.push({
                        updateOne: {
                            filter: { _id: p._id },
                            update: { $set: { name: newName } }
                        }
                    });
                    productUpdates++;
                }
            }
        }
        if (productOps.length > 0) {
            await db.collection('products').bulkWrite(productOps);
            console.log(`Capitalized ${productUpdates} products.`);
        }
        else {
            console.log('No products needed capitalization.');
        }
        // Process Categories
        const categories = await db.collection('categories').find({}).toArray();
        let categoryUpdates = 0;
        const categoryOps = [];
        for (const c of categories) {
            if (c.name && c.name.length > 0) {
                const newName = capitalizeFirstLetter(c.name);
                if (newName !== c.name) {
                    categoryOps.push({
                        updateOne: {
                            filter: { _id: c._id },
                            update: { $set: { name: newName } }
                        }
                    });
                    categoryUpdates++;
                }
            }
        }
        if (categoryOps.length > 0) {
            await db.collection('categories').bulkWrite(categoryOps);
            console.log(`Capitalized ${categoryUpdates} categories.`);
        }
        else {
            console.log('No categories needed capitalization.');
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await client.close();
    }
}
capitalizeNames();
