import 'dotenv/config';
import { sendWelcomeEmail } from './app/shared/email/email.service.js';
(async () => {
    console.log('Sending to linonline2024@gmail.com...');
    try {
        await sendWelcomeEmail('linonline2024@gmail.com', 'Test User');
        console.log('Sent successfully!');
    }
    catch (err) {
        console.error('Error:', err);
    }
    process.exit(0);
})();
