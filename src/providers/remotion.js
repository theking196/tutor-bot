const { Remotion } = require('remotion');

module.exports = {
  async generateVideo({ content, voice, speed = 1.0 }) {
    const video = await Remotion.run({
      duration: 10, // seconds
      frameRate: 30,
      width: 1280,
      height: 720,
      content,
      speed: speed,
      voice,
    });
    return video;
  }
};

module.exports = { generateVideo };