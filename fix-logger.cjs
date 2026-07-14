const fs = require('fs');
const path = require('path');

const filesToFix = [
  'app/config/db.ts',
  'app/contexts/catalog/inventory/inventory.service.ts',
  'app/contexts/identity/audit-log/audit-log.cron.ts',
  'app/contexts/sales/order/order.cron.ts',
  'app/contexts/sales/order/payment/payment.service.ts',
  'server.ts'
];

for (const file of filesToFix) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace logger.error("some string", errorVar) with logger.error({ err: errorVar }, "some string")
    // Also handles template literals: logger.error(`some string`, errorVar)
    content = content.replace(/logger\.error\((["'`][^"'`]+["'`]),\s*([^)]+)\)/g, (match, stringLiteral, errorVar) => {
      // If errorVar has trailing space or newline, trim it
      const err = errorVar.trim();
      return `logger.error({ err: ${err} }, ${stringLiteral})`;
    });

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Fixed ${file}`);
  }
}
