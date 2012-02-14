/*
    observable.js

	License: MIT license - http://www.opensource.org/licenses/mit-license.php
*/

"use strict"

var Observable

!function (Observable, global) {

	// utils
	function makeFun(length, fun) {
		if (typeof fun != "function" || length == fun.length)
			return fun
		var ret = (makeFun[length] || (makeFun[length] = eval("(" +
			function () {
				return function wrapper($params$) {
					return wrapper.target.apply(this, arguments)
				}
			}.toString().replace("$params$", function () {
				var p = []
				for (var i = 0; i < length; i++)
					p.push("p" + i)
				return p.join(", ")
			}())
			+ ")")))()
		ret.target = fun
		return ret
	}

	var id1 = 1, id2 = 1
	var magic = "__html$observable__"
	var sheduler = null
	var current = null
	var sortedActions = []
	var actions = {}

	var priorities = {}
	!["immediate", "realtime", "high", "abovenormal", "normal", "belownormal", "low", "idle"].
		forEach(function (n, i) { priorities[n] = i * 10 })

	// sorting by priority and by id to make earlier declared functions update earlier

	function pushActionI(i, item) {
		var j
		while (i > 0 && item._key < sortedActions[j = (i - 1) >> 1]._key) {
			sortedActions[i] = sortedActions[j]
			i = j
		}
		sortedActions[i] = item
	}

	function pushAction(action) {
		if (actions[action._id] != null)
			return
		sortedActions.push(null)
		pushActionI(sortedActions.length - 1, {
			_priority: action._priority,
			_id: action._id,
			_key: action._key || (action._key = str(action._priority) + "." + action._id)
		})
		actions[action._id] = action
	}

	function popActionI(i) {
		var ret = null
		if (i < sortedActions.length) {
			var id = sortedActions[i]._id
			ret = actions[id]
			delete actions[id]
			var j
			while (true) {
				if ((i << 1) + 2 < sortedActions.length) {
					var j1 = (i << 1) + 1
					var j2 = (i << 1) + 2
					var j = sortedActions[j1]._key < sortedActions[j2]._key ? j1 : j2
				}
				else {
					var j = (i << 1) + 1
					if (j >= sortedActions.length)
						break
				}
				sortedActions[i] = sortedActions[j]
				i = j
			}
			var last = sortedActions.pop()
			if (i < sortedActions.length)
				pushActionI(i, last)
		}
		return ret
	}

	function popAction(MaxPriority) {
		var ret = null
		while (ret == null && sortedActions.length && sortedActions[0]._priority <= MaxPriority)
			ret = popActionI(0)
		return ret
	}

	function actionsPresent() {
		return !!sortedActions.length
	}

	function str(i) {
		var c = i.toString()
		var b = c.length.toString()
		var a = b.length.toString()
		return a + b + c
	}

	function newID() {
		id1++
		if (id1 >= 1e15) {
			id1 = 1
			id2++
		}
		return str(id2) + "." + str(id1)
	}

	function isObservable(V) {
		return V && !!V[magic]
	}

	function defaultEqual(a, b) {
		return a == null ? b == null : a === b
	}

	function label(value) {
		return value.label ? value.label + " " + value._id : value._id
	}

	var Var = {
		toString: function () {
			return this._call().toString()
		},
		valueOf: function () {
			return this._call()
		},
		peek: function () {
			return this.__v // without touching
		},
		valueHasMutated: function () {
			this._doChanged()
		},
		subscribe: function () {
			var priority = null
			var that = this
			Array.slice(arguments).forEach(function (a) {
				if (typeof a != "function") {
					priority = a
					return
				}
				var cb = that
				var action = function () {
					cb()
					cb = a
				}
				action.label = a.name || a.label
				Define(priority, action)
			})
		},
		set: function (index, data) {
			if (!this._equal(this.__v[index], data)) {
				this.__v[name] = data
				this._doChanged()
			}
		},
		push: function() {
			var ret = this.__v.push.apply(this.__v, arguments)
			var changed = arguments.length > 0
			if (changed)
				this._doChanged()
			return ret
		},
		pop: function() {
			var changed = this.__v.length > 0
			var ret = this.__v.pop.apply(this.__v, arguments)
			if (changed)
				this._doChanged()
			return ret
		},
		unshift: function() {
			var ret = this.__v.unshift.apply(this.__v, arguments)
			var changed = arguments.length > 0
			if (changed)
				this._doChanged()
			return ret
		},
		shift: function() {
			var changed = this.__v.length > 0
			var ret = this.__v.shift.apply(this.__v, arguments)
			if (changed)
				this._doChanged()
			return ret
		},
		sort: function() {
			if (this.__v.length > 1) {
				this.__v.sort.apply(this.__v, arguments)
				this._doChanged()
			}
			return this
		},
		reverse: function() {
			if (this.__v.length > 1) {
				this.__v.reverse.apply(this.__v, arguments)
				this._doChanged()
			}
			return this
		},
		_written: function () {
			if (current) {
				var written = current._written || (current._written = {})
				written[this._id] = true
			}
		},
		_doChanged: function () {
			this._cleartimer()
			var flag = true
			var immediateActions = false
			while (flag) {
				flag = false
				for (var i in this._subscriptions) if (this._subscriptions.hasOwnProperty(i)) {
					flag = true
					var W = this._subscriptions[i]
					if (W._priority <= priorities.immediate)
						immediateActions = true
					W._unsubscribe()
					if (W._priority != null) {
						pushAction(W)
						sheduleActions()
					}
				}
			}
			this._subscriptions = null
			if (immediateActions)
				validateActions(priorities.immediate)
		},
		_cleartimer: function () {
			if (this._timer) {
				clearTimeout(this._timer)
				this._timer = null
			}
		},
		delay: function (delay, value) {
			this._cleartimer()
			var that = this
			this._timer = setTimeout(that, delay, value)
		},
		_call: function (write, newValue) {
			if (!write) {
				if (current && !(current._written && current._written[this._id]) && !(current._sources && current._sources[this._id])) {
					0,(this._subscriptions || (this._subscriptions = {}))[current._id] = current
					0,(current._sources || (current._sources = {}))[this._id] = this
				}
				return this.__v
			}
			this._cleartimer()
			this._written()
			var oldValue = this.__v
			var changed = !this._equal(this.__v, newValue)
			if (changed) {
				this.__v = newValue
				this._doChanged()
			}
			return oldValue
		},
		_subscriptions: null
	}

	Var[magic] = true

	var New = eval("0," + function (Var) { return function New(value, equal) {
		$body$
		V.__v = value
		V._id = newID()
		V._equal = equal || defaultEqual
		V._written()
		return V
		function V(/* MUST be of zero length */) {
			return V._call(arguments.length, arguments[0])
		}
	} }.toString().replace("$body$",
		Object.keys(Var).map(function (k) { return "V." + k + "=Var." + k }).join(";")
	) )(Var)

	function call(fun, that) {
		var a = []
		for (var i = 0; i < fun.length; i++)
			a.push(New())
		return fun.apply(that, a)
	}

	var Action = {

		invalidate: function () {
			this._unsubscribe()
			pushAction(this)
		},

		dispose: function () {
			if (this._action) {
				delete actions[this._id]
				this._unsubscribe()
				this._action = null
				this._priority = null
			}
		},

		wrap: function (onFail/*optional*/, action) {
			var that = this
			var args = Array.slice(arguments)
			action = args.pop()
			onFail = args.shift()
			var currentThread = this._action ? this._thread : null
			var ret = makeFun(action.length, function () {
				if (currentThread != that._thread) {
					if (typeof onFail == "function")
						return onFail()
					if (onFail && "throw" in onFail)
						throw onFail.throw
					return onFail == null ? onFail : onFail.return
				}
				return ret.action.apply(this, arguments)
			})
			ret.action = action
			return ret
		},

		_thread: 0,

		_unsubscribe: function () {
			if (this._sources) {
				for (var i in this._sources) if (this._sources.hasOwnProperty(i))
					delete this._sources[i]._subscriptions[this._id]
				this._sources = null
			}
			if (this._children) {
				for (var i in this._children) if (this._children.hasOwnProperty(i))
					this._children[i].dispose()
				this._children = null
			}
			this._written = null
			this._next = null
			var oncleanup
			if (oncleanup = this.oncleanup) {
				this.oncleanup = null
				try {
					oncleanup()
				}
				catch (e) {
					if (typeof console != "undefined")
						console.log("cleanup exception:", e, e && e.message, e && e.stack)
				}
			}
		},

		run: function () {
			if (!this._action)
				return
			var action
			if (action = this._next)
				this._next = null
			else {
				this._unsubscribe()
				this._thread++ // this._thread = newID()
				action = this._action
			}
			var previous = current
			current = this
			try {
				return call(action, this)
			}
			finally {
				current = previous
			}
		},

		next: function (action) {
			if (!action)
				return
			this._next = action
		},

		_children: null,
		_sources: null
	}

	Action[magic] = true

	Action = eval("0," + function (Action) { return function (id, priority, action) {
		return {
			$body$_id: id,
			_priority: priority,
			_action: action
		}
	} }.toString().replace("$body$",
		Object.keys(Action).map(function (k) { return k + ":Action." + k + "," }).join("")
	) )(Action)

	function Define(priority, action) {
		if (typeof action != "function")
			throw "action must be callable"

		var ret = Action( ( current ? current._id + " " : "" ) + newID(),
			priority in priorities ? priorities[ priority ] : priorities.normal, action )

		if (current)
			!(current._children || (current._children = [])).push(ret)

		if ( ret._priority == priorities.immediate )
			Synch( function () {
				do { ret.run() } while ( ret._next != null )
			} )
		else
			pushAction( ret )

		return ret
	}

	function sheduleActions() {
		if (sheduler == null && actionsPresent())
			sheduler = setTimeout(validateActionsThread, uiCareMode.peek() ? 1 : 0)
	}

	function validateActionsThread() {
		sheduler = null
		var start = Date.now()
		validateActions( Infinity, function () { return uiCareMode.peek() != null &&
			Date.now() - start > ( uiCareMode.peek() ? 1000 / 600 : 1000 / 30 ) } )
	}

	var pauseValidates = 0

	function doWithValidates(f) {
		pauseValidates++
		try {
			f()
		}
		finally {
			pauseValidates--
			sheduleActions()
		}
	}

	function validateActions( MaxPriority, checkTimeout ) {
		if ( pauseValidates )
			return false
		doWithValidates( function () {
			var W, f
			while ( W = popAction( MaxPriority ) ) {
				while ( true ) {
					W.run()
					if ( checkTimeout && checkTimeout() ) {
						checkTimeout = null
						MaxPriority = Math.min( MaxPriority, priorities.realtime )
					}
					if ( W._next == null )
						break
					if ( W._priority > MaxPriority ) {
						pushAction( W )
						return
					}
				}
			}
		} )
	}

	function Synch( proc ) {
		doWithValidates( proc )
		validateActions( priorities.immediate )
	}

	function F(fun) {
		var priority = "normal"
		if (arguments.length == 1 && typeof arguments[0] == "function")
			return Define(priority, arguments[0])
		if (arguments.length == 2 && typeof arguments[0] != "function" && typeof arguments[1] == "function")
			return Define(arguments[0], arguments[1])
		else {
			var ret = []
			for (var i = 0; i < arguments.length; i++)
				if (typeof arguments[i] == "function")
					ret.push(Define(priority, arguments[i]))
				else
					priority = arguments[i]
			return { dispose: function () { ret.forEach(function (a) { a.dispose() }) } }
		}
	}

	function standalone(fun) {
		var previous = current
		current = null
		try {
			return F.apply(this, arguments)
		}
		finally {
			current = previous
		}
	}

	var uiCareMode = New(false)

	Observable.uiCareMode = uiCareMode
	Observable.Create = function (read, equal) {
		if (isObservable(read))
			return read
		return New(read == null ? null : read, equal)
	}
	Observable.Define = Observable.F = F
	Observable.DefineStandalone = standalone
	Observable.Idle = function (fun) {
		Array.slice(arguments).forEach(function (f) { Define("idle", f) })
	}
	Observable.Synch = function (proc) {
		if (arguments.length > 1 || isObservable(proc)) {
			var p = []
			var i = 0
			while (i < arguments.length) {
				if (!isObservable(arguments[i]))
					p.push(arguments[i])
				else {
					p.push(arguments[i].bind(null, arguments[i + 1]))
					i++
				}
				i++
			}
			proc = function () { p.forEach(function (q) { q() }) }
		}
		Synch(proc)
	}

}(Observable || (Observable = {}), this)
