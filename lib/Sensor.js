const c9m = require('c9m');
const os = require('os');
const childProcess = require('child_process');


class Sensor extends c9m.Sensor {

  constructor () {
    super();
    this.name = 'system-memory';

    if (os.platform() === 'darwin') {
      this.readMemory = this.readDarwinMemory;
    } else {
      this.readMemory = this.readLinuxMemory;
    }
  }

  measure () {
    this.readMemory()
      .then((values) => {
        this.emit('value', values);
      });
  }

  readDarwinMemory () {
    const physicalMemory = new Promise((resolve, reject) => {
      childProcess.exec('sysctl hw.memsize', (error, stdout, stderr) => {
        if (error) return reject(error);
        resolve(parseInt(stdout.trim().split(' ')[1]));
      });
    });

    const stats = new Promise((resolve, reject) => {
      const pageSize = 4096;
      childProcess.exec('vm_stat', (error, stdout, stderr) => {
        if (error) return reject(error);
        const values = stdout
          .split('\n')
          .reduce((out, line) => {
            const match = line.match(/^(.+):\s+(.+)\.$/);
            if (match) out[match[1]] = parseInt(match[2]) * pageSize;
            return out;
          }, {});
        resolve(values);
      });
    });

    return Promise.all([physicalMemory, stats])
      .then((result) => {
        const [ physicalMemory, stats ] = result;
        const usedMb = (stats['Pages wired down'] + stats['Pages active'] + stats['Pages inactive']) / 1024 / 1024;
        const totalMb = physicalMemory / 1024 / 1024;
        return {
          used: Math.round(usedMb),
          total: Math.round(totalMb)
        };
      });
  }

  readLinuxMemory () {
    return new Promise((resolve, reject) => {
      childProcess.exec('cat /proc/meminfo | head -5', {shell: true}, (error, stdout) => {
        let totalMb;
        let freeMb;
        if (error || !stdout) {
          totalMb = os.totalmem() / 1024 / 1024;
          freeMb = os.freemem() / 1024 / 1024;
        } else {
          const values = stdout
            .split('\n')
            .reduce((out, line) => {
              const match = line.match(/^(.+):\s+(.+)\skB$/)
              if (match) out[match[1]] = parseInt(match[2]);
              return out;
            }, {});
          totalMb = values['MemTotal'] / 1024;
          freeMb = (values['MemFree'] + values['Buffers'] + values['Cached']) / 1024;
        }
        return {
          used: Math.round(totalMb - freeMb),
          total: Math.round(totalMb)
        };
      });
    });
  }
}

module.exports = Sensor;
