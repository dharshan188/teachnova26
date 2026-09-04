#!/usr/bin/env node
/**
 * End-to-end API verification for Phase 4 (Posts) + Phase 5 (Projects).
 *
 * Requires a running BuildHub dev server (default http://localhost:3000,
 * override with BASE_URL). Creates two throwaway users and exercises the
 * posts + projects endpoints including auth, ownership, validation, and
 * cross-feature behavior (project-linked posts, delete cascade semantics).
 *
 * Run: node scripts/verify-posts-projects.mjs
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

let passed = 0
let failed = 0

function check(name, condition, extra) {
  if (condition) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

function tokenFromSetCookie(setCookie) {
  const match = setCookie && setCookie.match(/buildhub_session=[^;]+/)
  return match ? match[0] : null
}

class Client {
  constructor() {
    this.cookie = ''
    this.cookies = []
  }

  async request(method, path, body) {
    const headers = this.cookie ? { Cookie: this.cookie } : {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const token = tokenFromSetCookie(setCookie)
      if (token && !this.cookies.includes(token)) this.cookies.push(token)
      this.cookie = token
    }
    let json = null
    try {
      json = await res.json()
    } catch {
      // non-JSON body is acceptable (e.g. empty ok bodies)
    }
    return { status: res.status, body: json, cookies: this.cookies }
  }

  get(path) {
    return this.request('GET', path)
  }
  post(path, body) {
    return this.request('POST', path, body)
  }
  patch(path, body) {
    return this.request('PATCH', path, body)
  }
  del(path) {
    return this.request('DELETE', path)
  }
}

function makeCredentials(label) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  return {
    name: `Verifier ${label}`,
    username: `vfy${label.toLowerCase()}_${stamp}`.slice(0, 20),
    email: `vfy${label.toLowerCase()}_${stamp}@example.com`,
    password: 'verifier-password-1',
  }
}

async function register(client, creds) {
  const res = await client.post('/api/auth/register', {
    name: creds.name,
    username: creds.username,
    email: creds.email,
    password: creds.password,
    confirmPassword: creds.password,
  })
  return res
}

function section(title) {
  console.log(`\n# ${title}`)
}

async function run() {
  const anon = new Client()
  const a = new Client()
  const b = new Client()

  const credsA = makeCredentials('A')
  const credsB = makeCredentials('B')

  section('Authentication setup')
  const regA = await register(a, credsA)
  check('A registers (201 + session cookie)', regA.status === 201 && regA.cookies.length === 1, `status=${regA.status}`)

  const regB = await register(b, credsB)
  check('B registers (201 + session cookie)', regB.status === 201 && regB.cookies.length === 1, `status=${regB.status}`)

  const badLogin = await anon.post('/api/auth/login', {
    identifier: credsA.username,
    password: 'wrong-password-123',
  })
  check('Login with wrong password → 401', badLogin.status === 401, `status=${badLogin.status}`)

  const badReg = await register(anon, { ...credsA, username: 'UPPER_CASE' })
  check('Register with invalid username → 400', badReg.status === 400 && typeof badReg.body?.error === 'string', `status=${badReg.status}`)

  section('Posts: auth + validation')
  const noAuthCreate = await anon.post('/api/posts', { content: 'hello' })
  check('Anonymous post create → 401', noAuthCreate.status === 401, `status=${noAuthCreate.status}`)

  const emptyPost = await a.post('/api/posts', { content: '   ' })
  check('Empty post content → 400', emptyPost.status === 400, `status=${emptyPost.status}`)

  const longPost = await a.post('/api/posts', { content: 'x'.repeat(1001) })
  check('Over-length post → 400', longPost.status === 400, `status=${longPost.status}`)

  const badTag = await a.post('/api/posts', { content: 'hi', tags: ['INVALID TAG'] })
  check('Invalid tag → 400', badTag.status === 400, `status=${badTag.status}`)

  const missingProject = await a.post('/api/posts', { content: 'hi', projectId: 'does-not-exist' })
  check('Post linking nonexistent project → 400', missingProject.status === 400, `status=${missingProject.status}`)

  section('Projects: create + slug uniqueness')
  const proj1 = await a.post('/api/projects', { name: 'Query Raft' })
  check('A creates project → 201', proj1.status === 201 && proj1.body?.project, `status=${proj1.status}`)
  if (proj1.body?.project) {
    const p = proj1.body.project
    check('Project slug is slugified', p.slug === 'query-raft', `slug=${p.slug}`)
    check('Project isMine true', p.isMine === true)
    check('Project owner = A', p.owner?.username === credsA.username)
    check('Project status defaults ACTIVE', p.status === 'ACTIVE')
  }

  const proj1b = await a.post('/api/projects', { name: 'Query Raft' })
  check('Duplicate name gets suffixed slug', proj1b.status === 201 && proj1b.body?.project?.slug === 'query-raft-2', `slug=${proj1b.body?.project?.slug}`)

  const projArchived = await a.post('/api/projects', { name: 'Done Thing', status: 'COMPLETED' })
  check('Custom status respected', projArchived.status === 201 && projArchived.body?.project?.status === 'COMPLETED', `status=${projArchived.body?.project?.status}`)

  const emptyProj = await a.post('/api/projects', { name: '   ' })
  check('Empty project name → 400', emptyProj.status === 400, `status=${emptyProj.status}`)

  section('Projects: reads (public)')
  const anonProjects = await anon.get('/api/projects')
  check('Anonymous project list → 200', anonProjects.status === 200 && Array.isArray(anonProjects.body?.projects), `status=${anonProjects.status}`)

  const bMine = await b.get('/api/projects?mine=1')
  check('B "mine" list starts empty', bMine.status === 200 && bMine.body?.projects.length === 0)

  const aMine = await a.get('/api/projects?mine=1')
  check('A "mine" list has A projects', aMine.status === 200 && aMine.body?.projects.length === 3)

  const proj1bList = await b.get('/api/projects')
  check('B can see A projects publicly', proj1bList.status === 200 && proj1bList.body?.projects.some((p) => p.id === proj1.body.project.id))

  section('Posts: create + read + ownership')
  let post1 = await a.post('/api/posts', { content: 'Working on Query Raft engines', projectId: proj1.body.project.id, tags: ['database', 'fast'] })
  check('A creates project-linked post → 201', post1.status === 201 && post1.body?.post, `status=${post1.status}`)
  if (post1.body?.post) {
    const p = post1.body.post
    check('Post isMine true', p.isMine === true)
    check('Post author = A', p.author?.username === credsA.username)
    check('Post linked to project', p.project?.id === proj1.body.project.id)
    check('Post tags preserved', Array.isArray(p.tags) && p.tags.length === 2)
  }

  const singlePost = await anon.get(`/api/posts/${post1.body.post.id}`)
  check('Anonymous read post → 200 + isMine false', singlePost.status === 200 && singlePost.body?.post?.isMine === false, `status=${singlePost.status}`)

  const listA = await anon.get('/api/posts')
  check('Anonymous post list → 200 with post', listA.status === 200 && listA.body?.posts.some((p) => p.id === post1.body.post.id))

  const feed404 = await anon.get('/api/posts/not-a-real-id')
  check('Unknown post → 404', feed404.status === 404, `status=${feed404.status}`)

  section('Cross-user authorization (B vs A)')
  const bUpdatePost = await b.patch(`/api/posts/${post1.body.post.id}`, { content: 'hijacked' })
  check('B edits A post → 403', bUpdatePost.status === 403, `status=${bUpdatePost.status}`)

  const bDeletePost = await b.del(`/api/posts/${post1.body.post.id}`)
  check('B deletes A post → 403', bDeletePost.status === 403, `status=${bDeletePost.status}`)

  const bUpdateProj = await b.patch(`/api/projects/${proj1.body.project.id}`, { name: 'Stolen' })
  check('B edits A project → 403', bUpdateProj.status === 403, `status=${bUpdateProj.status}`)

  const bDeleteProj = await b.del(`/api/projects/${proj1.body.project.id}`)
  check('B deletes A project → 403', bDeleteProj.status === 403, `status=${bDeleteProj.status}`)

  section('Posts: update')
  const relink = await a.patch(`/api/posts/${post1.body.post.id}`, { projectId: null })
  check('Unlink post from project', relink.status === 200 && relink.body?.post?.project == null, `status=${relink.status}`)

  const edited = await a.patch(`/api/posts/${post1.body.post.id}`, { content: 'Ship fast, measure often', tags: ['realtime'] })
  check('Edit post content+tags', edited.status === 200 && edited.body?.post?.content === 'Ship fast, measure often' && edited.body?.post?.tags[0] === 'realtime', `status=${edited.status}`)

  const relinkBack = await a.patch(`/api/posts/${post1.body.post.id}`, { projectId: proj1.body.project.id })
  check('Relink post to project', relinkBack.status === 200 && relinkBack.body?.post?.project?.id === proj1.body.project.id, `status=${relinkBack.status}`)

  section('Projects: update')
  const renamed = await a.patch(`/api/projects/${proj1.body.project.id}`, { name: 'Query Raft v2' })
  check('Rename project regenerates slug', renamed.status === 200 && renamed.body?.project?.slug === 'query-raft-v2', `slug=${renamed.body?.project?.slug}`)

  const marked = await a.patch(`/api/projects/${proj1.body.project.id}`, { status: 'COMPLETED' })
  check('Update project status', marked.status === 200 && marked.body?.project?.status === 'COMPLETED', `status=${marked.body?.project?.status}`)

  const blankPatch = await a.patch(`/api/posts/${post1.body.post.id}`, {})
  check('Empty post patch → 400', blankPatch.status === 400, `status=${blankPatch.status}`)

  section('Project delete → posts stay live but unlinked')
  const projToDelete = await a.post('/api/projects', { name: 'Ephemeral Project' })
  const orphan = await a.post('/api/posts', { content: 'temp update', projectId: projToDelete.body.project.id })
  check('Post linked to soon-deleted project', orphan.status === 201 && orphan.body?.post?.project?.id === projToDelete.body.project.id)

  const delProj = await a.del(`/api/projects/${projToDelete.body.project.id}`)
  check('Delete project → ok', delProj.status === 200 && delProj.body?.ok === true, `status=${delProj.status}`)

  const project404 = await a.get(`/api/projects/${projToDelete.body.project.id}`)
  check('Deleted project → 404', project404.status === 404, `status=${project404.status}`)

  const orphanPost = await a.get(`/api/posts/${orphan.body.post.id}`)
  check('Post survives project delete, project null', orphanPost.status === 200 && orphanPost.body?.post?.project == null, `status=${orphanPost.status}`)

  section('Post delete')
  const delPost = await a.del(`/api/posts/${post1.body.post.id}`)
  check('Delete own post → ok', delPost.status === 200 && delPost.body?.ok === true, `status=${delPost.status}`)

  const post404 = await a.get(`/api/posts/${post1.body.post.id}`)
  check('Deleted post → 404', post404.status === 404, `status=${post404.status}`)

  section('Likes: auth, duplicate, state')
  const socialPost = await a.post('/api/posts', { content: 'Now for social interactions' })
  check('A creates post for likes/comments', socialPost.status === 201 && socialPost.body?.post, `status=${socialPost.status}`)
  const socialId = socialPost.body.post.id

  const likeAnon = await anon.post(`/api/posts/${socialId}/like`)
  check('Anonymous like → 401', likeAnon.status === 401, `status=${likeAnon.status}`)

  const likeUnknown = await b.post('/api/posts/not-a-real-id/like')
  check('Like unknown post → 404', likeUnknown.status === 404, `status=${likeUnknown.status}`)

  const like1 = await b.post(`/api/posts/${socialId}/like`)
  check('B likes post → likeCount 1, likedByMe true', like1.status === 200 && like1.body?.likeCount === 1 && like1.body?.likedByMe === true, `status=${like1.status}`)

  const like2 = await b.post(`/api/posts/${socialId}/like`)
  check('Duplicate like is idempotent (count stays 1)', like2.status === 200 && like2.body?.likeCount === 1, `status=${like2.status} count=${like2.body?.likeCount}`)

  const postLiked = await b.get(`/api/posts/${socialId}`)
  check('B sees own like in post state', postLiked.status === 200 && postLiked.body?.post?.likedByMe === true && postLiked.body?.post?.likeCount === 1, `status=${postLiked.status}`)

  const postAsA = await a.get(`/api/posts/${socialId}`)
  check('A does NOT see B like as own', postAsA.status === 200 && postAsA.body?.post?.likedByMe === false && postAsA.body?.post?.likeCount === 1, `status=${postAsA.status}`)

  const unlike = await b.del(`/api/posts/${socialId}/like`)
  check('Unlike → count 0, likedByMe false', unlike.status === 200 && unlike.body?.likeCount === 0 && unlike.body?.likedByMe === false, `status=${unlike.status}`)

  const unlikeAgain = await b.del(`/api/posts/${socialId}/like`)
  check('Unlike when not liked is idempotent', unlikeAgain.status === 200 && unlikeAgain.body?.likeCount === 0, `status=${unlikeAgain.status}`)

  section('Comments: auth + validation')
  const commentAnon = await anon.post(`/api/posts/${socialId}/comments`, { content: 'anon' })
  check('Anonymous comment → 401', commentAnon.status === 401, `status=${commentAnon.status}`)

  const commentEmpty = await b.post(`/api/posts/${socialId}/comments`, { content: '   ' })
  check('Empty comment → 400', commentEmpty.status === 400, `status=${commentEmpty.status}`)

  const commentLong = await b.post(`/api/posts/${socialId}/comments`, { content: 'x'.repeat(501) })
  check('Over-length comment → 400', commentLong.status === 400, `status=${commentLong.status}`)

  const commentUnknownPost = await b.post('/api/posts/not-a-real-id/comments', { content: 'hello' })
  check('Comment on unknown post → 404', commentUnknownPost.status === 404, `status=${commentUnknownPost.status}`)

  const commentsUnknown = await anon.get('/api/posts/not-a-real-id/comments')
  check('List comments of unknown post → 404', commentsUnknown.status === 404, `status=${commentsUnknown.status}`)

  const blankCommentPatch = await b.patch(`/api/comments/${socialId}`, {})
  check('Empty comment patch → 400', blankCommentPatch.status === 400, `status=${blankCommentPatch.status}`)

  section('Comments: create + read')
  const c1 = await b.post(`/api/posts/${socialId}/comments`, { content: 'Impressive work here!' })
  check('B creates comment → 201, author B, isMine true', c1.status === 201 && c1.body?.comment?.author?.username === credsB.username && c1.body?.comment?.isMine === true, `status=${c1.status}`)

  const c2 = await a.post(`/api/posts/${socialId}/comments`, { content: 'Thanks — more soon.' })
  check('A creates comment → 201, author A', c2.status === 201 && c2.body?.comment?.author?.username === credsA.username, `status=${c2.status}`)

  const cList = await anon.get(`/api/posts/${socialId}/comments`)
  check('Comments list → 200, 2 comments, oldest first', cList.status === 200 && cList.body?.comments?.length === 2 && cList.body?.comments[0]?.id === c1.body?.comment?.id && cList.body?.comments[1]?.id === c2.body?.comment?.id, `status=${cList.status}`)
  check('Anonymous comment view has isMine false', cList.body?.comments?.every((c) => c.isMine === false))

  const postCounted = await anon.get(`/api/posts/${socialId}`)
  check('Post commentCount reflects creation', postCounted.status === 200 && postCounted.body?.post?.commentCount === 2, `status=${postCounted.status}`)

  section('Comments: ownership')
  const editAnon = await anon.patch(`/api/comments/${c1.body.comment.id}`, { content: 'hijack' })
  check('Anonymous edit comment → 401', editAnon.status === 401, `status=${editAnon.status}`)

  const editC1ByB = await b.patch(`/api/comments/${c1.body.comment.id}`, { content: 'Impressive work here — edited' })
  check('B edits own comment', editC1ByB.status === 200 && editC1ByB.body?.comment?.content === 'Impressive work here — edited', `status=${editC1ByB.status}`)

  const editC1ByA = await a.patch(`/api/comments/${c1.body.comment.id}`, { content: 'stolen' })
  check('A edits B comment → 403', editC1ByA.status === 403, `status=${editC1ByA.status}`)

  const editUnknown = await a.patch('/api/comments/not-a-real-id', { content: 'x' })
  check('Edit unknown comment → 404', editUnknown.status === 404, `status=${editUnknown.status}`)

  const delC1ByA = await a.del(`/api/comments/${c1.body.comment.id}`)
  check('A deletes B comment → 403', delC1ByA.status === 403, `status=${delC1ByA.status}`)

  const delC2ByB = await b.del(`/api/comments/${c2.body.comment.id}`)
  check('B deletes A comment → 403', delC2ByB.status === 403, `status=${delC2ByB.status}`)

  const delAnon = await anon.del(`/api/comments/${c2.body.comment.id}`)
  check('Anonymous delete comment → 401', delAnon.status === 401, `status=${delAnon.status}`)

  section('Comments: delete + persistence')
  const delC1 = await b.del(`/api/comments/${c1.body.comment.id}`)
  check('B deletes own comment → ok', delC1.status === 200 && delC1.body?.ok === true, `status=${delC1.status}`)

  const cListAfter = await b.get(`/api/posts/${socialId}/comments`)
  check('Deleted comment gone from list', cListAfter.status === 200 && cListAfter.body?.comments?.length === 1 && cListAfter.body?.comments[0]?.id === c2.body?.comment?.id)

  const delC2 = await a.del(`/api/comments/${c2.body.comment.id}`)
  check('A deletes own comment → ok', delC2.status === 200 && delC2.body?.ok === true, `status=${delC2.status}`)

  const cListEnd = await b.get(`/api/posts/${socialId}/comments`)
  check('Comments fully cleared from DB', cListEnd.status === 200 && cListEnd.body?.comments?.length === 0)

  const postCounted2 = await anon.get(`/api/posts/${socialId}`)
  check('Post commentCount reflects deletions', postCounted2.status === 200 && postCounted2.body?.post?.commentCount === 0, `status=${postCounted2.status}`)

  section('Projects: tags')
  const tagged = await a.post('/api/projects', { name: 'Tagged Engine', tags: ['react', 'postgresql'] })
  check('Create project with tags → tags returned', tagged.status === 201 && JSON.stringify(tagged.body?.project?.tags) === JSON.stringify(['react', 'postgresql']), `tags=${JSON.stringify(tagged.body?.project?.tags)}`)

  const tooManyTags = await a.post('/api/projects', { name: 'Tag Overflow', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })
  check('Project with > 7 tags → 400', tooManyTags.status === 400, `status=${tooManyTags.status}`)

  const badProjTag = await a.post('/api/projects', { name: 'Bad Tag', tags: ['INVALID TAG'] })
  check('Project with invalid tag → 400', badProjTag.status === 400, `status=${badProjTag.status}`)

  const retag = await a.patch(`/api/projects/${tagged.body.project.id}`, { tags: ['react'] })
  check('Update project tags', retag.status === 200 && JSON.stringify(retag.body?.project?.tags) === JSON.stringify(['react']), `tags=${JSON.stringify(retag.body?.project?.tags)}`)

  section('Projects: owner filter + pagination')
  const byOwner = await anon.get(`/api/projects?owner=${credsA.username}`)
  check('List projects by owner → all owned by A', byOwner.status === 200 && byOwner.body?.projects?.length >= 3 && byOwner.body?.projects?.every((p) => p.owner?.username === credsA.username), `status=${byOwner.status} count=${byOwner.body?.projects?.length}`)

  const paged = await anon.get('/api/projects?page=1&pageSize=2')
  check('Project list pagination → 2 items + total', paged.status === 200 && paged.body?.projects?.length === 2 && typeof paged.body?.pagination?.total === 'number' && paged.body?.pagination?.total >= 2, `status=${paged.status}`)

  const guestMine = await anon.get('/api/projects?mine=1')
  check('Guest "mine" list → 200 + empty', guestMine.status === 200 && guestMine.body?.projects?.length === 0, `status=${guestMine.status} count=${guestMine.body?.projects?.length}`)

  section('Posts: author filter')
  const taggedPost = await a.post('/api/posts', { content: 'Tagged Engine launch post', projectId: tagged.body.project.id, tags: ['react'] })
  check('Create post linked to tagged project', taggedPost.status === 201 && taggedPost.body?.post?.project?.id === tagged.body.project.id, `status=${taggedPost.status}`)

  const byAuthor = await anon.get(`/api/posts?author=${credsA.username}`)
  check('List posts by author → all authored by A', byAuthor.status === 200 && byAuthor.body?.posts?.length >= 1 && byAuthor.body?.posts?.every((p) => p.author?.username === credsA.username), `status=${byAuthor.status} count=${byAuthor.body?.posts?.length}`)

  section('Profile counts')
  const profile = await anon.get(`/api/users/${credsA.username}`)
  check('Profile exposes projectsCount/postsCount', profile.status === 200 && typeof profile.body?.user?.projectsCount === 'number' && typeof profile.body?.user?.postsCount === 'number' && profile.body?.user?.projectsCount >= 3, `status=${profile.status} projects=${profile.body?.user?.projectsCount} posts=${profile.body?.user?.postsCount}`)

  section('Cleanup')
  await a.del(`/api/projects/${proj1.body.project.id}`)
  await a.del(`/api/projects/${proj1b.body.project.id}`)
  await a.del(`/api/projects/${projArchived.body.project.id}`)
  await a.del(`/api/projects/${tagged.body.project.id}`)
  await a.del(`/api/posts/${socialId}`)
  await a.del(`/api/posts/${taggedPost.body.post.id}`)
  check('Cleanup issued', true)

  console.log(`\n========================================`)
  console.log(`BuildHub verification (posts/projects/likes/comments): ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

run().catch((err) => {
  console.error('Verification run crashed:', err)
  process.exitCode = 1
})