import { execFile } from 'child_process';
import fs from 'fs';

console.log('looking for vertices.json file..');

const jsonVertData = 'vertices.json';

if (fs.existsSync(jsonVertData)) {
    console.log('found vertices.json file, linking..');
    
    execFile('./main.exe', [jsonVertData], (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
} else {
    console.log('json file not found.');
}