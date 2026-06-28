import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
async function cleanOrphans() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();
        // Get all products to create a set of valid product IDs
        const products = await db.collection('products').find({}, { projection: { _id: 1 } }).toArray();
        const validProductIds = new Set(products.map(p => p._id.toString()));
        // Find all variants
        const variants = await db.collection('variants').find({}).toArray();
        let orphanedVariantIds = [];
        for (const variant of variants) {
            if (!variant.productId || !validProductIds.has(variant.productId.toString())) {
                orphanedVariantIds.push(variant._id);
            }
        }
        console.log(`Found ${orphanedVariantIds.length} orphaned variants.`);
        if (orphanedVariantIds.length > 0) {
            // Delete orphaned variants
            const result = await db.collection('variants').deleteMany({
                _id: { $in: orphanedVariantIds }
            });
            console.log(`Deleted ${result.deletedCount} orphaned variants.`);
            // Optionally clean up stock_transactions and batches related to these variants
            const stResult = await db.collection('stock_transactions').deleteMany({
                variantId: { $in: orphanedVariantIds }
            });
            console.log(`Deleted ${stResult.deletedCount} orphaned stock transactions.`);
            const bResult = await db.collection('batches').deleteMany({
                variantId: { $in: orphanedVariantIds }
            });
            console.log(`Deleted ${bResult.deletedCount} orphaned batches.`);
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await client.close();
    }
}
cleanOrphans();
