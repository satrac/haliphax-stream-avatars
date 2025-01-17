import 'https://cdn.jsdelivr.net/npm/vue@2/dist/vue.js';
import 'https://cdn.jsdelivr.net/npm/vuex@3.6.2/dist/vuex.js';

'use strict';

/** simple avatar object */
const Avatar = class {
	constructor(user, component) {
		this.user = user;
		this.component = component;
		this.existing = false;
		this.x = 0;
	}
};

/** simple chatter object */
const Chatter = class {
	constructor(user) {
		this.user = user;
		this.tags = new Set();
	}
};

/** simple animation event object */
const Animation = class {
	constructor(weight, className) {
		this.weight = weight;
		this.className = className;
	}
};

/** main Vuex store */
const store = new Vuex.Store({
	state: {
		availableAvatars: [],
		avatarLimit: 20,
		avatars: {},
		avatarsUrl: 'avatars.json',
		bot: false,
		chatters: {},
		choicesUrl: 'choices.json',
		corsProxy: 'http://localhost:8080/',
		excludeChatters: ['hxavatarsbot', 'streamelements'],
		excludeRandom: ['hide'],
		restricted: {},
		twitchUser: 'haliphax',
	},
	getters: {
		avatarsArray(state) {
			return Object.keys(state.avatars).map(v => state.avatars[v]);
		},
	},
	mutations: {
		avatars(state, val) {
			state.avatars = val;
		},
		chatters(state, val) {
			const keys = Object.keys(val),
				result = {},
				limit = Math.min(state.avatarLimit, keys.length);

			for (let i = 0; i < limit; i++) {
				const key = keys[i],
					chatters = val[key];

				for (let j = 0; j < chatters.length; j++) {
					const chatter = chatters[j];

					if (state.excludeChatters.indexOf(chatter) >= 0)
						continue;

					let chatterObj = null;

					if (result.hasOwnProperty(chatter))
						chatterObj = result[chatter];
					else
						chatterObj = new Chatter(chatter);

					chatterObj.tags.add(key);
					result[chatter] = chatterObj;
				}
			}

			state.chatters = result;
		},
		config(state, val) {
			for (const p in val)
				if (typeof state[p] != 'undefined'
					&& typeof val[p] != 'undefined')
				{
					state[p] = val[p];
				}
		},
		excludeRandom(state, val) {
			state.excludeRandom = val;
		},
		registerAvatar(state, val) {
			const assets = val.slice(1),
				key = val[0];

			if (state.availableAvatars.indexOf(key) >= 0)
				return;

			state.availableAvatars.push(key);

			for (let i = 0; i < assets.length; i++) {
				const s = document.createElement('link');

				s.type = 'text/css';
				s.rel = 'stylesheet';
				s.href = `${assets[i]}?_=${Date.now()}`;
				document.body.appendChild(s);
			}
		},
		restricted(state, val) {
			state.restricted = val;
		},
	},
	actions: {
		addAvatar(ctx, payload) {
			const copy = {},
				filteredAvatars = ctx.state.availableAvatars.filter(
					v => ctx.state.excludeRandom.indexOf(v.substring(7)) < 0),
				randomAvatar = filteredAvatars[
					Math.floor(Math.random() * filteredAvatars.length)],
				avatar = new Avatar(payload, randomAvatar);

			Object.assign(copy, ctx.state.avatars);
			copy[payload.user] = avatar;
			ctx.commit('avatars', copy);
		},
		async json(state, val) {
			for (let i = 0; i < val.avatars.length; i++)
				await import(`./avatars/${val.avatars[i]}/index.js`
					+ `?_=${Date.now()}`);

			if (val.hasOwnProperty('excludeRandom'))
				store.commit('excludeRandom', val.excludeRandom);

			if (val.hasOwnProperty('restricted')) {
				store.commit('restricted', val.restricted);
			}
		},
		async pollChoices(ctx) {
			await fetch(`${ctx.state.choicesUrl}?_=${Date.now()}`)
				.then(r => r.json()).then(d => {
					const keys = Object.keys(d);

					for (let i = 0; i < keys.length; i++) {
						const key = keys[i],
							value = d[key],
							avatar = ctx.state.avatars[key];

						avatar.existing = true;
						avatar.component = `avatar-${value}`;
					}
				});
		},
		removeAvatar(ctx, payload) {
			const copy = {};

			Object.assign(copy, ctx.state.avatars);
			delete copy[payload.user];
			ctx.commit('avatars', copy);
		},
		updateAvatars(ctx) {
			const keys = Object.keys(ctx.state.avatars),
				flat = Object.keys(ctx.state.chatters)
					.map(v => ctx.state.chatters[v])
					.reduce((p, v) => p.concat(v), []),
				flatObj = {};

			for (let i = 0; i < flat.length; i++)
				flatObj[flat[i].user] = 1;

			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];

				if (! flatObj.hasOwnProperty(key))
					ctx.dispatch('removeAvatar', key);
			}

			for (let i = 0; i < flat.length; i++) {
				const chatter = flat[i];

				if (typeof ctx.state.avatars[chatter.user] == 'undefined')
					ctx.dispatch('addAvatar', chatter);
			}
		},
		async fetch(ctx) {
			// requires cors-container - https://github.com/Rob--W/cors-anywhere
			await fetch(
				`${ctx.state.corsProxy}https://tmi.twitch.tv/group/user/`
					+ `${ctx.state.twitchUser}/chatters`)
				.then(r => r.json()).then(async d => {
					ctx.commit('chatters', d.chatters);
					ctx.dispatch('updateAvatars');

					if (ctx.state.bot)
						ctx.dispatch('pollChoices');
				});
		},
	},
});

/** Vue mixin for default avatar behavior */
const AvatarMixIn = Vue.extend({
	data() {
		return {
			// unique identifier for the avatar
			stub: '',
			// list of Animation objects to choose from for idle event
			idleAnimations: [],
			// if events should be disabled (e.g. on the list page)
			inactive: false,
			// if the component is currently being mounted
			mounting: true,
			// x coordinate of avatar on screen
			x: 0,
			// chance of avatar choosing to walk (between 0 and 1)
			walkProbability: 0.25,
			// maximum number of seconds to wait between decisions
			waitMaximum: 17,
			// minimum number of seconds to wait between decisions
			waitMinimum: 5,
			// number of milliseconds between "walking" the avatar 1 pixel
			walkInterval: 100 + Math.floor(Math.random() * 20) - 10,
		};
	},
	props: ['avatar'],
	methods: {
		act() {
			if (this.$el.dataset.eventClass) {
				this.$el.classList.remove(this.$el.dataset.eventClass);
				delete this.$el.dataset.eventClass;
			}

			if (Math.random() < this.walkProbability) {
				const destination = this.getRandomX();

				if (destination < this.x)
				{
					this.$el.classList.remove('right');
					this.$el.classList.add('left');
				}
				else {
					this.$el.classList.remove('left');
					this.$el.classList.add('right');
				}

				this.$el.classList.remove('idle');
				this.$el.classList.add('walking');
				this.walk(destination);

				return;
			}
			else {
				const weighted = {};

				if (this.idleAnimations.length == 0) {
					this.$el.classList.add('idle');
				}
				else {
					const
						total = this.idleAnimations.reduce(
							(p, v) => p + v.weight, 0),
						roll = Math.floor(Math.random() * total);
					let current = 0;

					for (let i = 0; i < this.idleAnimations.length; i++) {
						const anim = this.idleAnimations[i];

						if (roll <= anim.weight + current) {
							this.$el.dataset.eventClass = anim.className;
							this.$el.classList.add(anim.className);

							break;
						}

						current += anim.weight;
					}
				}
			}

			setTimeout(this.act,
				(this.waitMinimum + Math.floor(Math.random()
					* (this.waitMaximum - this.waitMinimum))) * 1000);
		},
		getRandomX() {
			return Math.floor(Math.random()
				* (window.innerWidth - this.$el.clientWidth));
		},
		walk(destination) {
			const direction = this.x < destination
				? 1 : -1;

			this.x += direction;

			if (this.x == destination) {
				this.$el.classList.remove('walking');
				this.act();

				return;
			}

			setTimeout(() => this.walk(destination), this.walkInterval);
		}
	},
	watch: {
		x(val) {
			if (!(this.mounting && this.avatar.existing))
				this.avatar.x = val;

			this.$el.style.left = val + 'px';
		},
	},
	mounted() {
		if (typeof this.avatar == 'undefined')
			return;

		if (this.avatar.existing)
			this.x = this.avatar.x;
		else if (this.mounting)
			this.x = this.getRandomX();

		if (Math.random() < 0.5)
			this.$el.classList.add('right');
		else
			this.$el.classList.add('left');

		this.mounting = false;
		this.act();
	},
	template: `
		<span :class="'avatar ' + stub">
			<avatar-label :avatar="avatar"></avatar-label>
			<div class="sprite"></div>
		</span>
	`,
});

Vue.component('avatar-label', {
	computed: {
		username() {
			if (typeof this.avatar == 'undefined'
				|| !this.avatar.user.hasOwnProperty('user'))
			{
				return;
			}

			return this.avatar.user.user;
		},
	},
	props: ['avatar'],
	template: `
		<span class="avatar-label">{{ username }}</span>
	`
});

Vue.component('stream-avatars', {
	props: [
		'avatarLimit',
		'avatarsUrl',
		'bot',
		'choicesUrl',
		'corsProxy',
		'excludeChatters',
		'twitchUser',
	],
	computed: {
		...Vuex.mapGetters(['avatarsArray']),
	},
	template: `
		<div>
			<component v-for="avatar in $store.getters.avatarsArray"
				:is="avatar.component" :key="avatar.user.user"
				:avatar="avatar" />
		</div>
	`,
	async mounted() {
		store.commit('config', {
			avatarLimit: this.$props.avatarLimit,
			avatarsUrl: this.$props.avatarsUrl,
			bot: this.$props.bot,
			choicesUrl: this.$props.choicesUrl,
			excludeChatters: this.$props.excludeChatters,
			corsProxy: this.$props.corsProxy,
			twitchUser: this.$props.twitchUser,
		});

		if (store.state.avatarsUrl) {
			await fetch(store.state.avatarsUrl).then(r => r.json())
				.then(async d => await store.dispatch('json', d));
		}

		await store.dispatch('fetch');
		setInterval(() => store.dispatch('fetch'), 10000);
	},
});

export { Animation, Avatar, AvatarMixIn, Chatter, store };
