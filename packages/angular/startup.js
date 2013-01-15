if(Meteor.isClient) {
	angular.element(document).ready(function() {
		angular.bootstrap(document, ["app"]);
	});
} else {
	
	angular.start = function(modules) {
		Meteor.startup(function() {
			var injector = createInjector(modules);
			injector.invoke(['$injector', function(injector){ }]);
		});
	}	
}