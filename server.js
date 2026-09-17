const Imap = require('imap');
const { simpleParser } = require('mailparser');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on port ${PORT}`);

wss.on('connection', function connection(ws) {
    console.log("✅ جهاز جديد متصل، في انتظار بيانات الإيميل...");
    let imap = null;
    let searchInterval = null;

    ws.on('message', function incoming(message) {
        try {
            const data = JSON.parse(message);
            
            if (data.action === 'start_imap' && data.email && data.password) {
                console.log(`محاولة الاتصال بالإيميل: ${data.email}`);

                if (imap) {
                    imap.end();
                    clearInterval(searchInterval);
                }

                imap = new Imap({
                    user: data.email,
                    password: data.password.replace(/\s+/g, ''),
                    host: 'imap.gmail.com',
                    port: 993,
                    tls: true,
                    tlsOptions: { rejectUnauthorized: false },
                    keepalive: true
                });

                imap.once('ready', function() {
                    console.log("📬 تم الاتصال بصندوق الوارد بنجاح! جاري البحث المستمر...");
                    
                    imap.openBox('INBOX', false, function(err, box) {
                        if (err) throw err;

                        function searchForOTP() {
                            // 🔴 التعديل هنا: البحث عن أي رسالة جديدة فقط (UNSEEN) بدون تحديد اسم المُرسل
                            imap.search(['UNSEEN'], function(err, results) {
                                if (err || !results || results.length === 0) return;
                                
                                const f = imap.fetch(results, { bodies: '', markSeen: true });
                                
                                f.on('message', function(msg, seqno) {
                                    msg.on('body', function(stream, info) {
                                        simpleParser(stream, (err, parsed) => {
                                            if (err) return;
                                            const body = parsed.text || parsed.html || "";
                                            
                                            const match = body.match(/\b\d{6}\b/);
                                            if (match) {
                                                console.log("🚀 تم إيجاد الكود: ", match[0]);
                                                ws.send(match[0]); 
                                            }
                                        });
                                    });
                                });
                            });
                        }

                        searchForOTP();
                        searchInterval = setInterval(searchForOTP, 3000);
                        
                        imap.on('mail', function(numNewMsgs) {
                            searchForOTP();
                        });
                    });
                });

                imap.once('error', function(err) {
                    console.log("❌ خطأ IMAP: ", err);
                    ws.send("ERROR");
                    clearInterval(searchInterval);
                });

                imap.connect();
            }
        } catch (e) {
            console.error("❌ بيانات غير صالحة مرسلة من المتصفح.");
        }
    });

    ws.on('close', () => {
        if (imap) imap.end();
        if (searchInterval) clearInterval(searchInterval);
        console.log("تم قطع الاتصال.");
    });
});
