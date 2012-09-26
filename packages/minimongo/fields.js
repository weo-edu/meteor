LocalCollection._getField = function(obj, field) {
	return _.reduce(field.split('.'), function(obj, attr) {
		if (obj)
			return obj[attr];
	}, obj);
}

LocalCollection._setField = function(obj, field, value) {
	var attrs = field.split('.');
	_.reduce(attrs, function(obj, attr, idx) {
		if (idx === attrs.length - 1)
			return obj[attr] = value

		if (!obj[attr])
			obj[attr] = {};
		return obj[attr];

	}, obj);
	return obj;
}

LocalCollection._fields = function(obj, fields) {
	return _.reduce(fields, function(new_obj, field) {
		LocalCollection._setField(new_obj, field, LocalCollection._getField(obj, field));
		return new_obj;
	}, {});
}