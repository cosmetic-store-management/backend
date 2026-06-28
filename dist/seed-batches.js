import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function generateBatchCode(mfg) {
    const y = mfg.getFullYear();
    const m = String(mfg.getMonth() + 1).padStart(2, '0');
    const d = String(mfg.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `LOT${y}${m}${d}-${rand}`;
}
async function seedBatches() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();
        const batches = await db.collection('batches').find({}).toArray();
        let count = 0;
        const bulkOps = [];
        for (const batch of batches) {
            if (!batch.batchCode || !batch.manufactureDate || !batch.expiryDate) {
                // Mfg between Jan 1 2023 and Jun 1 2024
                const mfg = randomDate(new Date(2023, 0, 1), new Date(2024, 5, 1));
                const exp = new Date(mfg);
                // Expiry is 2 to 3 years after mfg
                exp.setFullYear(exp.getFullYear() + Math.floor(Math.random() * 2) + 2);
                const code = generateBatchCode(mfg);
                bulkOps.push({
                    updateOne: {
                        filter: { _id: batch._id },
                        update: {
                            $set: {
                                batchCode: code,
                                manufactureDate: mfg,
                                expiryDate: exp
                            }
                        }
                    }
                });
                count++;
            }
        }
        if (bulkOps.length > 0) {
            console.log(`Executing ${bulkOps.length} batch updates...`);
            await db.collection('batches').bulkWrite(bulkOps);
        }
        console.log(`Successfully seeded ${count} batches.`);
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await client.close();
    }
}
seedBatches();
