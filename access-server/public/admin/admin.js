/*
 * TiddlyWiki Access Server - admin panel (step 08)
 *
 * A plain page (no framework, no build step) that uses the admin API of step 07/07b:
 *   /api/admin/users, /api/admin/groups, /api/admin/tiddlers,
 *   /api/admin/tiddler-groups, /api/admin/tiddler-owner
 * plus /health, /api/setup, /api/login, /api/logout and /api/me.
 *
 * Rules (roadmap step 8.2):
 *   - ONE helper, api(), adds the login token, unwraps the {RESP, CODE, MSG, DATA} envelope
 *     and sends the browser back to the login screen on 401.
 *   - Text that users typed (titles, descriptions, names) is ALWAYS inserted as text
 *     (el() / textContent), NEVER as HTML. This file contains no innerHTML at all.
 *   - Buttons are disabled while their request runs; the server's MSG is shown on errors.
 *   - The server decides everything (last admin, self-protection, valid groups);
 *     the panel only shows what it says.
 *
 * The login token is kept in sessionStorage: closing the tab logs the admin out of the panel.
 * API paths are relative ("../api/...") so the panel also works behind a path prefix.
 */
(function() {
	'use strict';

	var TOKEN_KEY = 'tiddlyAccessAdmin.token';
	var TAB_KEY = 'tiddlyAccessAdmin.tab';
	var API = '../';   // the panel lives at <server>/admin/

	var state = {
		token: null,
		me: null,          // the logged-in administrator (publicUser)
		users: [],
		groups: [],
		tiddlers: [],
		selected: new Set(),   // selected tiddler titles
		tab: 'users',
		editingUser: null,     // user being edited (null = adding)
		editingGroup: null
	};

	// ================================================================ small helpers

	function $(id) { return document.getElementById(id); }

	// Build an element. Strings in `children` become TEXT nodes, so they can never be HTML.
	//   el('td', { className: 'x', onclick: fn }, ['some text', otherNode])
	function el(tag, props, children) {
		var node = document.createElement(tag);
		Object.keys(props || {}).forEach(function(key) {
			var value = props[key];
			if (value === undefined || value === null || value === false) return;
			if (key === 'className') node.className = value;
			else if (key === 'text') node.textContent = String(value);
			else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
			else if (key === 'checked' || key === 'disabled' || key === 'value' || key === 'selected') node[key] = value;
			else node.setAttribute(key, value === true ? '' : String(value));
		});
		(children || []).forEach(function(child) {
			if (child === null || child === undefined || child === false) return;
			node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
		});
		return node;
	}

	function clear(node) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	function storageGet(key) {
		try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
	}
	function storageSet(key, value) {
		try {
			if (value === null) window.sessionStorage.removeItem(key);
			else window.sessionStorage.setItem(key, value);
		} catch (e) { /* private mode: the login simply does not survive a reload */ }
	}

	function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

	// "202611101230" (TiddlyWiki, UTC) or an ISO date -> local "2026-11-10 18:00"; anything else as is
	function formatDate(value) {
		if (!value) return '—';
		var s = String(value), d = null;
		var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{3})?$/.exec(s);
		if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
		else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s);
		if (!d || isNaN(d.getTime())) return s;
		function two(n) { return (n < 10 ? '0' : '') + n; }
		return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' +
			two(d.getHours()) + ':' + two(d.getMinutes());
	}

	// ================================================================ messages

	var messageTimer = null;

	// kind: 'ok' (disappears after a while), 'error' or 'info'
	function message(text, kind) {
		var box = $('message');
		window.clearTimeout(messageTimer);
		box.textContent = text || '';
		box.className = 'message ' + (kind || 'info');
		box.hidden = !text;
		if (text && kind === 'ok') {
			messageTimer = window.setTimeout(function() { box.hidden = true; }, 6000);
		}
	}

	// Show an error from api() - unless api() already handled it (e.g. back to login on 401)
	function showError(err, targetId) {
		if (err && err.handled) return;
		var text = (err && err.message) || String(err);
		if (targetId) $(targetId).textContent = text;
		else message(text, 'error');
	}

	// ================================================================ the one API helper

	function ApiError(status, text, handled) {
		var e = new Error(text);
		e.status = status;
		e.handled = !!handled;
		return e;
	}

	// api('GET', 'api/admin/users') -> DATA of the envelope, or throws ApiError(status, MSG)
	// opts.noToken: send no login token; opts.keep401: a 401 is a normal answer (wrong password)
	async function api(method, path, body, opts) {
		opts = opts || {};
		var headers = {};
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (state.token && !opts.noToken) headers['Authorization'] = 'Bearer ' + state.token;

		var res;
		try {
			res = await fetch(API + path, {
				method: method,
				headers: headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				cache: 'no-store'
			});
		} catch (e) {
			throw ApiError(0, 'Cannot reach the server. Is it running?');
		}

		var envelope = null;
		try { envelope = await res.json(); } catch (e) { /* not JSON */ }
		var msg = (envelope && envelope.MSG) || ('Server answered ' + res.status);

		if (res.status === 401 && !opts.keep401) {
			loggedOut('Your login has ended (expired, or the server was restarted). Please log in again.', 'error');
			throw ApiError(401, msg, true);
		}
		if (res.status === 403 && msg === 'Administrator only') {
			// Another administrator removed our administrator rights
			logoutQuietly();
			loggedOut('This account is no longer an administrator.', 'error');
			throw ApiError(403, msg, true);
		}
		if (!res.ok || !envelope || envelope.RESP !== 'OK') {
			throw ApiError(res.status, msg);
		}
		return envelope.DATA;
	}

	// Disable `button` (and show a busy cursor) while fn() runs
	async function busy(button, fn) {
		if (button) button.disabled = true;
		document.body.classList.add('busy');
		try {
			return await fn();
		} finally {
			if (button) button.disabled = false;
			document.body.classList.remove('busy');
		}
	}

	// ================================================================ screens

	var SCREENS = ['loading', 'apikey', 'setup', 'login', 'main'];

	function showScreen(name) {
		SCREENS.forEach(function(s) { $('screen-' + s).hidden = s !== name; });
		$('whoami').hidden = name !== 'main';
		var focus = { setup: 'setup-username', login: 'login-username' }[name];
		if (focus) $(focus).focus();
	}

	function closeDialogs() {
		Array.prototype.forEach.call(document.querySelectorAll('dialog[open]'), function(d) { d.close(); });
	}

	// Back to the login screen (token forgotten)
	function loggedOut(text, kind) {
		state.token = null;
		state.me = null;
		state.users = []; state.groups = []; state.tiddlers = [];
		state.selected.clear();
		storageSet(TOKEN_KEY, null);
		closeDialogs();
		showScreen('login');
		message(text || '', kind || 'info');
	}

	// Tell the server to end this login; errors do not matter
	function logoutQuietly() {
		var token = state.token;
		if (!token) return;
		fetch(API + 'api/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })
			.catch(function() {});
	}

	// ================================================================ start-up

	async function start() {
		showScreen('loading');
		$('loading-text').textContent = 'Connecting to the server...';
		$('retry-button').hidden = true;

		var health;
		try {
			health = await api('GET', 'health', undefined, { noToken: true });
		} catch (e) {
			$('loading-text').textContent = e.message;
			$('retry-button').hidden = false;
			return;
		}
		if (health.authMode !== 'users') return showScreen('apikey');
		if (health.setupRequired) return showScreen('setup');

		// Still logged in from before a reload (same tab)?
		state.token = storageGet(TOKEN_KEY);
		if (state.token) {
			try {
				var me = await api('GET', 'api/me', undefined, { keep401: true });
				if (me.isAdmin) return enter(state.token, me);
			} catch (e) { /* expired: log in again */ }
			state.token = null;
			storageSet(TOKEN_KEY, null);
		}
		showScreen('login');
	}

	// Logged in (or first admin created): open the panel - administrators only
	async function enter(token, user) {
		if (!user.isAdmin) {
			state.token = token;
			logoutQuietly();   // do not leave a normal user's login open
			state.token = null;
			throw ApiError(403, 'This account is not an administrator. Log in to the wiki with it instead.');
		}
		state.token = token;
		state.me = user;
		storageSet(TOKEN_KEY, token);
		$('whoami-text').textContent = 'Logged in as ' + user.username;
		showScreen('main');
		message('');
		selectTab(storageGet(TAB_KEY) || 'users');
		await reloadAll();
	}

	async function onSetup(ev) {
		ev.preventDefault();
		$('setup-error').textContent = '';
		var username = $('setup-username').value.trim();
		var password = $('setup-password').value;
		if (password !== $('setup-confirm').value) {
			$('setup-error').textContent = 'The two passwords are not the same.';
			return;
		}
		await busy($('setup-submit'), async function() {
			try {
				var d = await api('POST', 'api/setup', { username: username, password: password }, { noToken: true });
				$('setup-password').value = $('setup-confirm').value = '';
				await enter(d.token, d.user);
				message('Administrator "' + d.user.username + '" created. Next: add groups, then users.', 'ok');
			} catch (e) { showError(e, 'setup-error'); }
		});
	}

	async function onLogin(ev) {
		ev.preventDefault();
		$('login-error').textContent = '';
		var username = $('login-username').value.trim();
		var password = $('login-password').value;
		await busy($('login-submit'), async function() {
			try {
				var d = await api('POST', 'api/login', { username: username, password: password }, { noToken: true, keep401: true });
				$('login-password').value = '';
				await enter(d.token, d.user);
			} catch (e) { showError(e, 'login-error'); }
		});
	}

	async function onLogout() {
		logoutQuietly();
		loggedOut('Logged out.', 'info');
	}

	// ================================================================ loading data

	async function reloadAll() {
		await busy($('reload-button'), async function() {
			try {
				var results = await Promise.all([
					api('GET', 'api/admin/users'),
					api('GET', 'api/admin/groups'),
					api('GET', 'api/admin/tiddlers')
				]);
				state.users = results[0];
				state.groups = results[1];
				state.tiddlers = results[2];
				// Forget selected tiddlers that no longer exist
				var titles = new Set(state.tiddlers.map(function(t) { return t.title; }));
				state.selected.forEach(function(t) { if (!titles.has(t)) state.selected.delete(t); });
				renderAll();
			} catch (e) { showError(e); }
		});
	}

	function renderAll() {
		$('count-users').textContent = '(' + state.users.length + ')';
		$('count-groups').textContent = '(' + state.groups.length + ')';
		$('count-tiddlers').textContent = '(' + state.tiddlers.length + ')';
		renderUsers();
		renderGroups();
		renderBulk();
		renderTiddlers();
	}

	function emptyRow(columns, text) {
		return el('tr', null, [el('td', { className: 'empty', colspan: columns, text: text })]);
	}

	function groupChips(groups, noneText) {
		if (!groups || !groups.length) {
			return [el('span', { className: 'chip admin-only', text: noneText || 'none' })];
		}
		return groups.map(function(g) { return el('span', { className: 'chip', text: g }); });
	}

	function selectTab(name) {
		if (['users', 'groups', 'tiddlers'].indexOf(name) === -1) name = 'users';
		state.tab = name;
		storageSet(TAB_KEY, name);
		Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(button) {
			button.setAttribute('aria-selected', button.getAttribute('data-tab') === name ? 'true' : 'false');
		});
		['users', 'groups', 'tiddlers'].forEach(function(t) { $('tab-' + t).hidden = t !== name; });
	}

	// ================================================================ users tab

	function renderUsers() {
		var body = $('users-body');
		clear(body);
		if (!state.users.length) body.appendChild(emptyRow(7, 'No users'));
		state.users.forEach(function(u) {
			var self = u.username === state.me.username;
			body.appendChild(el('tr', { className: u.disabled ? 'is-disabled' : '' }, [
				el('td', null, [u.username, self ? el('span', { className: 'badge', text: 'you' }) : null]),
				el('td', null, u.groups.length ? groupChips(u.groups) : [el('span', { className: 'muted', text: 'no group' })]),
				el('td', null, [u.defaultGroup || '—']),
				el('td', null, [u.isAdmin ? 'yes' : 'no']),
				el('td', null, [u.disabled ? el('span', { className: 'badge off', text: 'disabled' }) : 'active']),
				el('td', null, [formatDate(u.created)]),
				el('td', { className: 'actions' }, [
					el('button', { type: 'button', className: 'small', text: 'Edit', onclick: function() { openUserDialog(u); } }),
					el('button', {
						type: 'button', className: 'small danger', text: 'Delete', disabled: self,
						title: self ? 'You cannot delete your own account' : null,
						onclick: function(ev) { deleteUser(u, ev.currentTarget); }
					})
				])
			]));
		});
	}

	function groupCheckboxes(container, ticked, onChange) {
		clear(container);
		if (!state.groups.length) {
			container.appendChild(el('span', { className: 'muted', text: 'No groups yet - add them in the Groups tab.' }));
			return;
		}
		state.groups.forEach(function(g) {
			container.appendChild(el('label', { title: g.description || null }, [
				el('input', { type: 'checkbox', value: g.name, checked: ticked.indexOf(g.name) !== -1, onchange: onChange }),
				g.name
			]));
		});
	}

	function tickedGroups(container) {
		return Array.prototype.map.call(container.querySelectorAll('input[type=checkbox]:checked'), function(i) { return i.value; });
	}

	// Default-group choices = the ticked groups
	function fillDefaultGroup(wanted) {
		var select = $('user-default');
		var groups = tickedGroups($('user-groups'));
		clear(select);
		select.appendChild(el('option', { value: '', text: groups.length ? '(the first ticked group)' : '(no group)' }));
		groups.forEach(function(g) { select.appendChild(el('option', { value: g, text: g })); });
		select.value = groups.indexOf(wanted) !== -1 ? wanted : '';
	}

	function openUserDialog(u) {
		state.editingUser = u || null;
		var self = !!u && u.username === state.me.username;
		$('user-dialog-title').textContent = u ? 'Edit user "' + u.username + '"' : 'Add user';
		$('user-name').value = u ? u.username : '';
		$('user-name').readOnly = !!u;
		$('user-password').value = '';
		$('user-password').required = !u;
		$('user-password-label').textContent = u ? 'New password (optional)' : 'Password';
		$('user-password-hint').textContent = u
			? 'Leave empty to keep the current password.' + (self ? '' : ' A new password ends this user\'s current logins.')
			: 'At least 8 characters. Give it to the user; they log in to the wiki with it.';
		groupCheckboxes($('user-groups'), u ? u.groups : [], function() { fillDefaultGroup($('user-default').value); });
		fillDefaultGroup(u ? u.defaultGroup : '');
		$('user-admin').checked = !!(u && u.isAdmin);
		$('user-disabled').checked = !!(u && u.disabled);
		$('user-disabled-row').hidden = !u;
		$('user-admin').disabled = self;
		$('user-disabled').disabled = self;
		$('user-self-note').hidden = !self;
		$('user-error').textContent = '';
		$('user-dialog').showModal();
		(u ? $('user-password') : $('user-name')).focus();
	}

	async function saveUser(ev) {
		ev.preventDefault();
		var u = state.editingUser;
		var self = !!u && u.username === state.me.username;
		var password = $('user-password').value;
		var body = {
			groups: tickedGroups($('user-groups')),
			defaultGroup: $('user-default').value || null
		};
		if (!self) body.isAdmin = $('user-admin').checked;
		$('user-error').textContent = '';

		await busy($('user-save'), async function() {
			try {
				var d;
				if (u) {
					if (password) body.password = password;
					if (!self) body.disabled = $('user-disabled').checked;
					d = await api('PUT', 'api/admin/users/' + encodeURIComponent(u.username), body);
					message('User "' + d.user.username + '" saved.' + (password ? ' New password set.' : ''), 'ok');
				} else {
					body.username = $('user-name').value.trim();
					body.password = password;
					d = await api('POST', 'api/admin/users', body);
					message('User "' + d.user.username + '" created.', 'ok');
				}
				$('user-dialog').close();
				await reloadAll();
			} catch (e) {
				if (e.handled) return;
				showError(e, 'user-error');
			}
		});
	}

	async function deleteUser(u, button) {
		var owned = state.tiddlers.filter(function(t) { return t.owner === u.username; }).length;
		var text = 'Delete user "' + u.username + '"? Their current logins end.' +
			(owned ? '\n\nThey own ' + plural(owned, 'tiddler') + '. The tiddlers stay; give them a new owner in the Tiddlers tab.' : '');
		if (!window.confirm(text)) return;
		await busy(button, async function() {
			try {
				await api('DELETE', 'api/admin/users/' + encodeURIComponent(u.username));
				message('User "' + u.username + '" deleted.', 'ok');
				await reloadAll();
			} catch (e) { showError(e); }
		});
	}

	// ================================================================ groups tab

	function renderGroups() {
		var body = $('groups-body');
		clear(body);
		if (!state.groups.length) body.appendChild(emptyRow(6, 'No groups yet. Add one, then give it to users.'));
		state.groups.forEach(function(g) {
			body.appendChild(el('tr', null, [
				el('td', null, [el('span', { className: 'chip', text: g.name })]),
				el('td', { className: g.description ? '' : 'muted' }, [g.description || '—']),
				el('td', { className: 'num' }, [g.users]),
				el('td', { className: 'num' }, [g.tiddlers]),
				el('td', null, [formatDate(g.created)]),
				el('td', { className: 'actions' }, [
					el('button', { type: 'button', className: 'small', text: 'Edit', onclick: function() { openGroupDialog(g); } }),
					el('button', { type: 'button', className: 'small danger', text: 'Delete', onclick: function(ev) { deleteGroup(g, ev.currentTarget); } })
				])
			]));
		});
	}

	function openGroupDialog(g) {
		state.editingGroup = g || null;
		$('group-dialog-title').textContent = g ? 'Edit group "' + g.name + '"' : 'Add group';
		$('group-name').value = g ? g.name : '';
		$('group-name').readOnly = !!g;
		$('group-name-hint').hidden = !!g;
		$('group-description').value = g ? g.description : '';
		$('group-error').textContent = '';
		$('group-dialog').showModal();
		(g ? $('group-description') : $('group-name')).focus();
	}

	async function saveGroup(ev) {
		ev.preventDefault();
		var g = state.editingGroup;
		var description = $('group-description').value;
		$('group-error').textContent = '';
		await busy($('group-save'), async function() {
			try {
				var d;
				if (g) {
					d = await api('PUT', 'api/admin/groups/' + encodeURIComponent(g.name), { description: description });
					message('Group "' + d.group.name + '" saved.', 'ok');
				} else {
					d = await api('POST', 'api/admin/groups', { name: $('group-name').value.trim(), description: description });
					message('Group "' + d.group.name + '" created.', 'ok');
				}
				$('group-dialog').close();
				await reloadAll();
			} catch (e) {
				if (e.handled) return;
				showError(e, 'group-error');
			}
		});
	}

	// First try a normal delete; if the server says the group is in use (409),
	// show its message and offer to delete it anyway (force).
	async function deleteGroup(g, button) {
		if (!window.confirm('Delete group "' + g.name + '"?')) return;
		await busy(button, async function() {
			try {
				var d;
				try {
					d = await api('DELETE', 'api/admin/groups/' + encodeURIComponent(g.name));
				} catch (e) {
					if (e.status !== 409) throw e;
					var again = e.message + '\n\nTiddlers left without any group become visible to administrators only.' +
						'\n\nDelete the group anyway?';
					if (!window.confirm(again)) return;
					d = await api('DELETE', 'api/admin/groups/' + encodeURIComponent(g.name) + '?force=true');
				}
				message('Group "' + d.deleted + '" deleted' +
					(d.removedFromUsers || d.removedFromTiddlers
						? ' (removed from ' + plural(d.removedFromUsers, 'user') + ' and ' + plural(d.removedFromTiddlers, 'tiddler') + ').'
						: '.'), 'ok');
				await reloadAll();
			} catch (e) { showError(e); }
		});
	}

	// ================================================================ tiddlers tab

	function visibleTiddlers() {
		var words = $('tiddler-filter').value.trim().toLowerCase();
		var onlyUngrouped = $('tiddler-ungrouped').checked;
		return state.tiddlers.filter(function(t) {
			if (onlyUngrouped && t.groups.length) return false;
			if (!words) return true;
			var hay = [t.title, t.owner || '', t.modifier || ''].concat(t.groups, t.tags || []).join('\n').toLowerCase();
			return hay.indexOf(words) !== -1;
		});
	}

	function renderTiddlers() {
		var body = $('tiddlers-body');
		var shown = visibleTiddlers();
		var userNames = new Set(state.users.map(function(u) { return u.username; }));
		clear(body);
		$('tiddler-shown').textContent = shown.length === state.tiddlers.length
			? plural(state.tiddlers.length, 'tiddler')
			: 'Showing ' + shown.length + ' of ' + state.tiddlers.length;

		if (!shown.length) {
			body.appendChild(emptyRow(6, state.tiddlers.length ? 'No tiddler matches the filter' : 'No tiddlers on the server yet'));
		}
		shown.forEach(function(t) {
			var picked = state.selected.has(t.title);
			var owner = !t.owner ? el('span', { className: 'muted', text: 'none' })
				: userNames.has(t.owner) ? t.owner
				: el('span', { title: 'This user no longer exists' }, [t.owner, el('span', { className: 'badge off', text: 'deleted user' })]);
			body.appendChild(el('tr', { className: picked ? 'selected' : '' }, [
				el('td', { className: 'pick' }, [el('input', {
					type: 'checkbox', checked: picked, 'aria-label': 'Select ' + t.title,
					onchange: function(ev) {
						if (ev.currentTarget.checked) state.selected.add(t.title); else state.selected.delete(t.title);
						renderTiddlers();
						renderBulkState();
					}
				})]),
				el('td', { className: 'title' }, [t.title]),
				el('td', null, groupChips(t.groups, 'administrators only')),
				el('td', null, [owner]),
				el('td', null, [formatDate(t.modified)]),
				el('td', null, [t.modifier || '—'])
			]));
		});

		// "select all" box: ticked when every shown tiddler is selected
		var all = $('tiddler-all');
		var pickedShown = shown.filter(function(t) { return state.selected.has(t.title); }).length;
		all.checked = shown.length > 0 && pickedShown === shown.length;
		all.indeterminate = pickedShown > 0 && pickedShown < shown.length;
		all.disabled = shown.length === 0;
	}

	function onSelectAll(ev) {
		var tick = ev.currentTarget.checked;
		visibleTiddlers().forEach(function(t) {
			if (tick) state.selected.add(t.title); else state.selected.delete(t.title);
		});
		renderTiddlers();
		renderBulkState();
	}

	// Group checkboxes and owner list of the bulk bar (keeps what was ticked)
	function renderBulk() {
		var ticked = tickedGroups($('bulk-groups'));
		groupCheckboxes($('bulk-groups'), ticked, function() {});
		var select = $('bulk-owner');
		var current = select.value;
		clear(select);
		select.appendChild(el('option', { value: '', text: '(no owner)' }));
		state.users.forEach(function(u) { select.appendChild(el('option', { value: u.username, text: u.username })); });
		select.value = state.users.some(function(u) { return u.username === current; }) ? current : '';
		renderBulkState();
	}

	function renderBulkState() {
		var n = state.selected.size;
		$('bulk-count').textContent = n ? plural(n, 'tiddler') + ' selected' : 'Select tiddlers below to change their groups or owner';
		$('bulk').classList.toggle('inactive', n === 0);
		['bulk-clear', 'bulk-apply', 'bulk-owner-apply'].forEach(function(id) { $(id).disabled = n === 0; });
	}

	async function applyBulkGroups(ev) {
		var titles = Array.from(state.selected);
		var groups = tickedGroups($('bulk-groups'));
		var mode = $('bulk-mode').value;
		if (!titles.length) return;
		if (mode !== 'set' && !groups.length) {
			message('Tick at least one group to ' + mode + '.', 'error');
			return;
		}
		var question = mode === 'set' && !groups.length
			? 'No group is ticked: ' + plural(titles.length, 'tiddler') + ' will be visible to ADMINISTRATORS ONLY. Continue?'
			: { add: 'Add', remove: 'Remove', set: 'Set' }[mode] + ' group(s) ' + groups.join(', ') +
				(mode === 'add' ? ' to ' : mode === 'remove' ? ' from ' : ' as the only groups of ') + plural(titles.length, 'tiddler') + '?';
		if (!window.confirm(question)) return;

		var button = ev.currentTarget;
		await busy(button, async function() {
			try {
				var d = await api('PUT', 'api/admin/tiddler-groups', { titles: titles, groups: groups, mode: mode });
				message('Groups changed on ' + plural(d.updated.length, 'tiddler') + '.' +
					(d.notFound.length ? ' Not found (deleted meanwhile?): ' + d.notFound.join(', ') : ''), 'ok');
				await reloadAll();
			} catch (e) { showError(e); }
		});
	}

	async function applyBulkOwner(ev) {
		var titles = Array.from(state.selected);
		var owner = $('bulk-owner').value || null;
		if (!titles.length) return;
		if (!window.confirm((owner ? 'Make "' + owner + '" the owner of ' : 'Remove the owner of ') + plural(titles.length, 'tiddler') + '?' +
			(owner ? '' : '\n\nWithout an owner, only administrators can delete them or change their groups.'))) return;

		var button = ev.currentTarget;
		await busy(button, async function() {
			try {
				var d = await api('PUT', 'api/admin/tiddler-owner', { titles: titles, owner: owner });
				message('Owner ' + (owner ? '"' + owner + '"' : 'removed') + ' on ' + plural(d.updated.length, 'tiddler') + '.' +
					(d.notFound.length ? ' Not found: ' + d.notFound.join(', ') : ''), 'ok');
				await reloadAll();
			} catch (e) { showError(e); }
		});
	}

	// ================================================================ wiring

	function wire() {
		$('retry-button').addEventListener('click', start);
		$('setup-form').addEventListener('submit', onSetup);
		$('login-form').addEventListener('submit', onLogin);
		$('logout-button').addEventListener('click', onLogout);
		$('reload-button').addEventListener('click', function() { message(''); reloadAll(); });

		Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(button) {
			button.addEventListener('click', function() { selectTab(button.getAttribute('data-tab')); });
		});

		$('add-user-button').addEventListener('click', function() { openUserDialog(null); });
		$('user-form').addEventListener('submit', saveUser);
		$('add-group-button').addEventListener('click', function() { openGroupDialog(null); });
		$('group-form').addEventListener('submit', saveGroup);
		Array.prototype.forEach.call(document.querySelectorAll('dialog .cancel'), function(button) {
			button.addEventListener('click', function() { button.closest('dialog').close(); });
		});

		$('tiddler-filter').addEventListener('input', renderTiddlers);
		$('tiddler-ungrouped').addEventListener('change', renderTiddlers);
		$('tiddler-all').addEventListener('change', onSelectAll);
		$('bulk-clear').addEventListener('click', function() { state.selected.clear(); renderTiddlers(); renderBulkState(); });
		$('bulk-apply').addEventListener('click', applyBulkGroups);
		$('bulk-owner-apply').addEventListener('click', applyBulkOwner);
	}

	document.addEventListener('DOMContentLoaded', function() {
		wire();
		start();
	});
})();
