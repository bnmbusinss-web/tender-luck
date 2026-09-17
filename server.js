const Imap = require('imap');
const { simpleParser } = require('mailparser');
const WebSocket = require('ws');

// Railway يحدد المنفذ تلقائياً عبر process.env.PORT
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on port ${PORT}`);

wss.on('connection', function connection(ws) {
    console.log("✅ جهاز جديد متصل عبر Railway!");
});

function broadcastOTP(otp) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(otp);
        }
    });
    console.log("🚀 تم بث الكود بنجاح: ", otp);
}

// استدعاء الإيميل وكلمة المرور من إعدادات Railway بأمان
const imap = new Imap({
    user: process.env.EMAIL_ADDRESS,
    password: process.env.APP_PASSWORD, 
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
});

function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
}

imap.once('ready', function() {
    openInbox(function(err, box) {
        if (err) throw err;
        console.log("📬 تم الاتصال بصندوق الوارد بنجاح!");
        
        imap.on('mail', function(numNewMsgs) {
            imap.search(['UNSEEN', ['FROM', 'noreply.app@blsinternational.com']], function(err, results) {
                if (err || !results || results.length === 0) return;

                const f = imap.fetch(results, { bodies: '', markSeen: true });
                
                f.on('message', function(msg, seqno) {
                    msg.on('body', function(stream, info) {
                        simpleParser(stream, (err, parsed) => {
                            if (err) return;
                            const body = parsed.text || parsed.html || "";
                            
                            const match = body.match(/\b\d{6}\b/);
                            if (match) {
                                broadcastOTP(match[0]);
                            }
                        });
                    });
                });
            });
        });
    });
});

imap.once('error', function(err) {
    console.log("❌ خطأ في اتصال IMAP: ", err);
});

imap.connect();
