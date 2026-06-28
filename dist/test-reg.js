import 'dotenv/config';
import mongoose from 'mongoose';
import { register } from './app/modules/auth/auth.service.js';
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        // Delete if exists
        await mongoose.connection.collection('users').deleteOne({ email: 'linonline2024@gmail.com' });
        await register({
            name: 'Thanh Ngô',
            email: 'linonline2024@gmail.com',
            phone: '0988777123',
            password: 'password123',
            confirmPassword: 'password123'
        });
        console.log('Registered! Waiting 5 seconds for background email to send...');
        setTimeout(() => {
            console.log('Done.');
            process.exit(0);
        }, 5000);
    }
    catch (e) {
        console.error('ERROR', e.status, e.message);
        process.exit(1);
    }
});
