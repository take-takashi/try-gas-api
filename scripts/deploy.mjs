import { spawn } from 'node:child_process';

const deploymentId = process.env.CLASP_DEPLOYMENT_ID;

if (!deploymentId) {
  throw new Error('CLASP_DEPLOYMENT_ID is required');
}

const clasp = spawn('clasp', ['deploy', '-i', deploymentId], {
  stdio: 'inherit',
});

clasp.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
