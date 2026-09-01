/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/login", destination: "/login.html" },
      { source: "/signup", destination: "/signup.html" },
    ];
  },
};

module.exports = nextConfig;
