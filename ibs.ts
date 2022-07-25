/* Middleware framework we're using + URL router */
import { Application, Context, Router } from "https://deno.land/x/oak/mod.ts";
/* Thing to escape text so that no naughty boys
 * trying to fuck anything up actually go through
 */
import escape from "https://raw.githubusercontent.com/lodash/lodash/master/escape.js";

/*** Global variables ***/
const BBS_DIR = "bbs";
const BBS_PORT = 8000;

/* Generate message for BBS  */
async function GEN_BBS_MSG(
  name: string,
  id: string,
  tripcode: string | null,
  message: string,
) {
  const d = new Date();

  let hash;

  if (tripcode !== null) {
    hash = await crypto.subtle.digest(
      "SHA-256",
      (new TextEncoder()).encode(tripcode),
    );
    hash = btoa(String.fromCharCode(...new Uint8Array(hash)));
  } else {
    hash = "None";
  }

  return (
    "\n" +
    `USER: ${name.padEnd(12)} | DATE: ${d.toUTCString()}\n` +
    `ID:   ${id} | TRIP: ${hash.slice(0, 12)}\n` +
    "--------------------------------------------------------\n" +
    `${message}\n` +
    "\n"
  );
}

/* Split text up to not overflow (What's the right word for this?)  */
function split(str, maxLength){
    if(str.length <= maxLength)
        return str;
    let reg = new RegExp(".{1," + maxLength + "}","g");
    let parts = str.match(reg);
    return parts.join('\n');
}


/* Boilerplate for errors (This saves ~12 SLOC) */
function genErr(ctx: Context, message: string) {
  ctx.response.body = `Error: ${message}`;
  ctx.response.type = "text/plain";
  ctx.response.status = 400;
}

/* Boilerplate to make thread HTML compliant. */
function PAD_THREAD(id: string, thread: string) {
    return `<html>\n<body>\n<pre>${escape(thread)}</pre>\n
<form method="POST" action="./${id}" id="usrsub" enctype="multipart/form-data" class="post">
<textarea rows="1" cols="25" name="name" form="usrsub" placeholder="Name"></textarea>
<textarea rows="1" cols="25" name="trip" form="usrsub" placeholder="Trip"></textarea>
<br>
<textarea rows="5" cols="54" name="msg" form="usrsub" placeholder="Reply"></textarea>
<br>
<input type="submit" value="Submit">
</form>\n</body>\n</html>`;
}

/* This is where the fun begins... */
const board = new Router();

board.get("/", async function (ctx) {
  let threadCatalog = `<html>\n<body>
<form method="POST" action="." id="usrsub" enctype="multipart/form-data" class="post">
<textarea rows="1" cols="54" name="title" form="usrsub" placeholder="Thread Title"></textarea><br>
<textarea rows="1" cols="25" name="name" form="usrsub" placeholder="Name"></textarea>
<textarea rows="1" cols="25" name="trip" form="usrsub" placeholder="Trip"></textarea>
<br>
<textarea rows="5" cols="54" name="msg" form="usrsub" placeholder="Reply"></textarea>
<br>

<input type="submit" value="Submit">
</form>
<pre>
+---------------------------------------------------------+
|                       LATEST THREADS                    |
+---------------------------------------------------------+

`;
  for await (let thread of Deno.readDir(BBS_DIR)) {
    let file = await Deno.readTextFile(`${BBS_DIR}/${thread.name}`)
    threadCatalog += `<a href="./${thread.name}">${thread.name}</a> - ${file.split('\n').shift()}\n`;
  }

  threadCatalog += `</pre>\n</body>\n</html>`;
  ctx.response.body = threadCatalog;
  ctx.response.type = "text/html";
  ctx.response.status = 200;
});

board.post("/", async function (ctx) {
  /* boilerplate bullshit */
  const body = await ctx.request.body();
  const value = await body.value;
  let formData = await value.read();
  formData = formData.fields;
    
  if (formData.title.length < 1) {
    genErr(ctx, "Your title isn't long enough");
    return;
  }

  if (formData.title.length > 90) {
    genErr(ctx, "Your title is too long.");
    return;
  }

  if (formData.msg.length < 1) {
    genErr(ctx, "Your message isn't long enough");
    return;
  }

  if (formData.name.length > 12) {
    genErr(ctx, "Your name is too long.");
    return;
  }

  const id = crypto.randomUUID().split("-")[4];

  const initialThread = (
    `${formData.title}${await GEN_BBS_MSG(
      formData.name ??= "Unknown",
      id,
      formData.trip ??= null,
      split(formData.msg),
    )}\nREPLIES\n========================================================\n`
  );

  await Deno.writeTextFile(`${BBS_DIR}/${id}`, initialThread);

  ctx.response.redirect(`/${id}`);
});

board.get("/:id", async function (ctx) {
  let file = "";

  try {
    file = await Deno.readTextFile(`${BBS_DIR}/${ctx.params.id}`);
    file = PAD_THREAD(ctx.params.id, file);
  } catch {
    genErr(ctx, "File not found.");
  }
    
  ctx.response.body = file;
  ctx.response.type = "text/html";
  ctx.response.status = 200;
});

board.post("/:id", async function (ctx) {
  /* boilerplate bullshit */
  const body = await ctx.request.body();
  const value = await body.value;
  let formData = await value.read();
  formData = formData.fields;
    
  if (formData.name.length < 1) {
    genErr(ctx, "Your message isn't long enough");
    return;
  }

  if (formData.name.length > 12) {
    genErr(ctx, "Your name is too long.");
    return;
  }

  let file: string;

  try {
    file = await Deno.readTextFile(`${BBS_DIR}/${ctx.params.id}`);
  } catch {
    genErr(ctx, "File not found.");
    return;
  }

  const id = crypto.randomUUID().split("-")[4];

  const msg = await GEN_BBS_MSG(
    formData.name ??= "Unknown",
    id,
    formData.trip ??= null,
    split(formData.msg),
  );

  file += msg;

  await Deno.writeTextFile(`${BBS_DIR}/${ctx.params.id}`, file);

  ctx.response.redirect(
    ctx.request.url,
  );
});

/* Actually start the website */
const ibs = new Application();

ibs.use(board.routes());
ibs.use(board.allowedMethods());

ibs.addEventListener(
  "listen",
  (_e) => console.log(`Listening on http://localhost:${BBS_PORT}`),
);

await ibs.listen({ port: BBS_PORT });
