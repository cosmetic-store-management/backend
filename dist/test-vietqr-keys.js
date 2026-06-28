async function testLookup() {
    try {
        const res = await fetch('https://api.vietqr.io/v2/lookup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': '07a0ef30-02b7-48d2-b874-a62e579522d6',
                'x-api-key': '86e49dfd-c14f-449a-a98f-5bd803dab334'
            },
            body: JSON.stringify({
                bin: "970436", // VCB
                accountNumber: "1049298711"
            })
        });
        const data = await res.json();
        console.log('Lookup res:', data);
    }
    catch (e) {
        console.log('Lookup error:', e.message);
    }
}
testLookup();
export {};
