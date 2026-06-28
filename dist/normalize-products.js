import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
async function normalizeProducts() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();
        const products = await db.collection('products').find({}).toArray();
        const brands = await db.collection('brands').find({}).toArray();
        const brandMap = new Map();
        brands.forEach(b => brandMap.set(b._id.toString(), b.name));
        let count = 0;
        const bulkOps = [];
        for (const product of products) {
            if (product.brandId) {
                const brandName = brandMap.get(product.brandId.toString());
                if (brandName) {
                    const prefix1 = `${brandName} - `;
                    const prefix2 = `${brandName}-`;
                    let newName = product.name;
                    if (product.name.startsWith(prefix1)) {
                        newName = product.name.substring(prefix1.length).trim();
                    }
                    else if (product.name.startsWith(prefix2)) {
                        newName = product.name.substring(prefix2.length).trim();
                    }
                    if (newName !== product.name) {
                        bulkOps.push({
                            updateOne: {
                                filter: { _id: product._id },
                                update: { $set: { name: newName } }
                            }
                        });
                        count++;
                    }
                }
            }
        }
        if (bulkOps.length > 0) {
            console.log(`Executing ${bulkOps.length} updates...`);
            await db.collection('products').bulkWrite(bulkOps);
        }
        console.log(`Normalized ${count} products.`);
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await client.close();
    }
}
normalizeProducts();
