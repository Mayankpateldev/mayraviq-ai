const response = await fetch("http://127.0.0.1:4000/__local/backup", {
  method: "POST",
  headers: {
    Authorization: "Bearer local-development",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirmed: true }),
});
if (!response.ok)
  throw Error("Local backup failed. Start the embedded development API first.");
console.log(JSON.stringify(await response.json(), null, 2));
export {};
