async function testBanks() {
    const res = await fetch('https://api.vietqr.io/v2/banks');
    const data = await res.json();
    console.log('Banks count:', data.data?.length);
    console.log('Sample bank:', data.data?.[0]);
}
async function testLookup() {
    try {
        const res = await fetch('https://api.vietqr.io/v2/lookup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bin: "970436", // VCB
                accountNumber: "0011004123456"
            })
        });
        const data = await res.json();
        console.log('Lookup res:', data);
    }
    catch (e) {
        console.log('Lookup error:', e.message);
    }
}
testBanks().then(testLookup);
export {};
