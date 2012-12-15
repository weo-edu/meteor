(function() {

window.AngularTemplates = {};

Meteor._def_angular_template = function(name, template) {
	AngularTemplates[name] = template;
}

var meteorModule = angular.module("meteor", []);

meteorModule.run(['$rootScope', function($rootScope) {
	$rootScope.$safeApply = function(expr) {
		var phase = this.$root.$$phase;
		if (phase === '$apply' || phase === '$digest') 
			this.$eval(expr);
		else
			this.$apply(expr);
	}
}]);

meteorModule.factory("$templates", function() {
	return function(path) {
		return AngularTemplates[path];
	}
});

angular.module("app", ["meteor"]);

angular.element(document).ready(function() {
	angular.bootstrap(document, ["app"]);

});

})();

