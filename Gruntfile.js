module.exports = function(grunt) {
	grunt.initConfig({
		//读取package.json文件
		pkg: grunt.file.readJSON('package.json'),
	    // Empties folders to start fresh
	    clean: {
	    	another:'app/dist/ng*.js',
			dist: 'app/dist/*.js'
	    },
		//concat用来合并js文件
		concat: {
			options: {
				separator: ';'
			},
			dist: {
				src: ['js/deferAsync/*.js'],
				dest: 'app/dist/<%= pkg.name %>.js'
			}
		},
		//uglify用来压缩js文件
		uglify: {
			options: {
			// 此处定义的banner注释将插入到输出文件的顶部
				banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
			},
            removeComments: {//任务一：压缩a.js，不混淆变量名，保留注释，添加banner和footer
                options: {
                    mangle: false, //不混淆变量名
                    preserveComments: 'false' //不删除注释，还可以为 false（删除全部注释），some（保留@preserve @license @cc_on等注释）
                },
                files: {
                    'bower_components/angular-translate/angular-translate.no_comment.js': ['bower_components/angular-translate/angular-translate.js']
                }
            },
			dist: {
				files: {
				//uglify会自动压缩concat任务中生成的文件
					'app/dist/<%= pkg.name %>.min.js': ['<%= concat.dist.dest %>']
				}
			}
		}

	});
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.registerTask("myClean", ['clean:dist']);
	grunt.registerTask('test', ['myClean', 'concat', 'uglify']);
	grunt.registerTask('testNew', ['clean:another', 'concat', 'uglify']);
	grunt.registerTask('default', ['test']);
	grunt.registerTask('removeComment', ['uglify:removeComments']);
};
