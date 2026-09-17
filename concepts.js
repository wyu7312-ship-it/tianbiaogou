// 网申填充助手 · 概念表（纯数据，唯一需随表单话术增多而长期扩充的文件）
// 规则：①zh 用"短核词"（标签完整包含即命中，如'手机'命中"常用手机"）；②en 全部小写无空格；
// ③person:true 的概念允许"母亲/父亲/紧急联系人…"等人称 scope；④禁止出现任何真实个人信息。
window.WSA_CONCEPTS = [
  { id: 'name', label: '姓名', person: true, zh: ['姓名', '名字', '真实姓名'], en: ['name', 'fullname', 'yourname'] },
  { id: 'phone', label: '手机号', person: true, zh: ['手机', '电话', '号码', '移动', '联系方式', '手机号', '电话号码'], en: ['phone', 'mobile', 'tel', 'telephone', 'contactnumber', 'phonenumber', 'mobilephone'] },
  { id: 'email', label: '邮箱', person: true, zh: ['邮箱', '邮件', '电子邮箱', '电子邮件'], en: ['email', 'mail'] },
  { id: 'gender', label: '性别', zh: ['性别', '男女'], en: ['gender', 'sex'] },
  { id: 'ethnicity', label: '民族', zh: ['民族', '少数民族'], en: ['ethnicity', 'nation'] },
  { id: 'birthdate', label: '出生年月', person: true, zh: ['出生', '生日', '出生日期', '出生年月'], en: ['birth', 'birthday', 'birthdate'] },
  { id: 'idno', label: '身份证号', zh: ['身份证', '证件号', '证件号码', '身份编号'], en: ['idcard', 'idnumber'] },
  { id: 'hometown', label: '籍贯', zh: ['籍贯', '户籍', '户口', '生源地', '家乡'], en: ['nativeplace', 'hometown'] },
  { id: 'politics', label: '政治面貌', zh: ['政治面貌', '党团情况', '政治身份'], en: ['politicalstatus'] },
  { id: 'education', label: '学历', zh: ['学历', '文化程度', '教育程度', '最高学历'], en: ['education', 'qualification', 'degreelevel'] },
  { id: 'degree', label: '学位', zh: ['学位', '最高学位', '学术学位'], en: ['degree', 'bachelor', 'master'] },
  { id: 'major', label: '专业', zh: ['专业', '所学专业', '专业名称', '所学专业名称'], en: ['major', 'subject', 'specialization'] },
  { id: 'school', label: '毕业院校', zh: ['毕业院校', '学校', '院校', '就读学校', '毕业学校', '大学'], en: ['school', 'university', 'college', 'institute'] },
  { id: 'grad_date', label: '毕业时间', zh: ['毕业时间', '毕业年月', '预计毕业', '离校时间', '毕业'], en: ['graduation', 'gradyear', 'graduationdate'] },
  { id: 'period', label: '起止时间', zh: ['起止', '时间', '在职时间', '任职时间'], en: ['period', 'start', 'enddate'] },
  { id: 'intent', label: '求职意向', zh: ['求职意向', '意向岗位', '应聘岗位', '期望职位', '应聘志愿', '志愿'], en: ['position', 'intendedposition', 'desiredposition'] },
  { id: 'city', label: '期望工作地', zh: ['工作地', '意向城市', '期望城市', '工作地点', '工作城市', '城市'], en: ['location', 'city', 'worklocation', 'workplace'] },
  { id: 'company', label: '工作经历-单位', zh: ['单位', '公司', '工作单位', '实习单位', '公司名称', '单位名称'], en: ['company', 'employer', 'organization'] },
  { id: 'jobtitle', label: '工作职位', zh: ['职位', '职务', '岗位', '工作内容', '岗位职责'], en: ['title', 'jobtitle', 'role', 'duty'] },
  { id: 'english', label: '英语水平', zh: ['英语', '外语', '英语水平', '英语等级', '外语水平'], en: ['english', 'cet', 'toefl', 'ielts'] },
  { id: 'cet_score', label: '英语成绩', zh: ['成绩', '分数', '成绩分数'], en: ['score'] },
  { id: 'putonghua', label: '普通话等级', zh: ['普通话', '普通话水平'], en: ['mandarin', 'putonghua'] },
  { id: 'comp_level', label: '计算机等级', zh: ['计算机', '电脑'], en: ['computer'] },
  { id: 'license', label: '驾照', zh: ['驾照', '驾驶证', '准驾'], en: ['license', 'driving'] },
  { id: 'award', label: '获奖情况', zh: ['获奖', '荣誉', '奖励', '奖学金', '奖项'], en: ['award', 'honor', 'prize', 'scholarship'] },
  { id: 'selfeval', label: '自我评价', zh: ['自我评价', '个人评价', '个人小结', '自我介绍', '个人简介', '自荐'], en: ['aboutme', 'selfevaluation', 'summary'] },
  { id: 'address', label: '家庭住址', person: true, zh: ['住址', '地址', '通讯地址', '居住地'], en: ['address', 'homeaddress'] },
  { id: 'qq', label: 'QQ号', person: true, zh: ['qq', '企鹅'], en: ['qq'] },
  { id: 'emergency', label: '紧急联系人', person: true, zh: ['紧急联系人', '联系人', '紧急联系方式'], en: ['emergency', 'emergencycontact'] },
];
// 人称限定词：数组顺序=优先级（长词/专词在前，防"联系人"抢"紧急联系人"）；words≥2字防误伤
window.WSA_QUALIFIERS = [
  { key: 'emergency', alias: '紧急联系人', words: ['紧急联系人', '紧急联系'] },
  { key: 'mother', alias: '母亲', words: ['母亲', '妈妈'] },
  { key: 'father', alias: '父亲', words: ['父亲', '爸爸'] },
  { key: 'spouse', alias: '配偶', words: ['配偶', '爱人', '妻子', '丈夫'] },
  { key: 'other', alias: '其他亲属', words: ['亲属', '家人', '朋友'] },
  { key: 'self', alias: '本人', words: ['本人', '自己', '申请人'] },
];
