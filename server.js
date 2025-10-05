import express from 'express';
import { execFile } from 'child_process';
import fs from 'fs';

const app = express();

// Add CORS middleware BEFORE other middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.static('.'));
app.use(express.json());

app.post('/api/run-tetgen', (req, res) => {
    console.log('Received request to run DA2.exe');
    
    const plyFilePath = "models/ply/monke_test/Monke.ply";

    if (!fs.existsSync(plyFilePath)) {
        console.error("PLY file not found: ", plyFilePath);
        res.status(404).json({ 
            success: false, 
            error: `PLY file not found: ${plyFilePath}` 
        });
        return;
    }

    if (!fs.existsSync('./build/DA2.exe')) {
        console.error('DA2.exe not found in build directory');
        res.status(404).json({ 
            success: false, 
            error: 'DA2.exe not found in ./build/ directory' 
        });
        return;
    }
    
    execFile('./build/DA2.exe', [plyFilePath], (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            res.status(500).json({ 
                success: false, 
                error: stderr 
            });
            return;
        }
        
        console.log(`stdout: "${stdout}"`);
        res.json({ 
            success: true, 
            output: stdout.trim() 
        });
    });
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});