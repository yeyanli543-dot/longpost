import { Link } from 'react-router-dom';
import { Reveal } from '@/components/ui/reveal';

const LegalPageLayout: React.FC<{
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}> = ({ title, lastUpdated, children }) => {
  return (
    <div className="min-h-screen bg-black text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <Link
            to="/"
            className="text-blue-500 hover:text-blue-400 text-sm font-medium"
          >
            ← 返回首页
          </Link>
        </div>

        <header className="mb-10 pb-8 border-b border-gray-800">
          <h1 className="text-4xl font-bold text-gray-100 mb-3">{title}</h1>
          <p className="text-sm text-gray-500">最后更新：{lastUpdated}</p>
        </header>

        <article className="prose prose-invert prose-gray max-w-none">
          {children}
        </article>

        <footer className="mt-16 pt-8 border-t border-gray-800 text-center">
          <p className="text-sm text-gray-500">
            如有疑问，请通过站内私信或邮箱联系我们。
          </p>
        </footer>
      </div>
    </div>
  );
};

const Section: React.FC<{ heading: string; children: React.ReactNode }> = ({
  heading,
  children,
}) => (
  <section className="mb-10">
    <Reveal y={22}>
      <h2 className="text-2xl font-bold text-gray-100 mb-4">{heading}</h2>
      <div className="space-y-4 text-base leading-relaxed text-gray-300">
        {children}
      </div>
    </Reveal>
  </section>
);

const SubSection: React.FC<{ heading: string; children: React.ReactNode }> = ({
  heading,
  children,
}) => (
  <div className="mb-5">
    <h3 className="text-lg font-semibold text-gray-200 mb-2">{heading}</h3>
    <div className="space-y-3 text-base leading-relaxed text-gray-300">
      {children}
    </div>
  </div>
);

const PrivacyPage: React.FC = () => {
  return (
    <LegalPageLayout title="隐私政策" lastUpdated="2026 年 9 月 18 日">
      <Section heading="引言">
        <p>
          LongPost（以下简称"我们"）非常重视用户的隐私保护。本隐私政策旨在向您说明我们如何收集、使用、存储、共享和保护您的个人信息。请您在使用我们的服务前仔细阅读本政策，确保您充分理解并同意本政策的全部内容。
        </p>
        <p>
          使用 LongPost 服务，即表示您同意本政策所述的信息收集、使用和存储方式。如果您不同意本政策的任何内容，请停止使用我们的服务。
        </p>
      </Section>

      <Section heading="一、我们收集的信息">
        <SubSection heading="1.1 账号信息">
          <p>当您注册 LongPost 账号时，我们会收集以下信息：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>电子邮箱：用于账号身份验证、登录、找回密码及重要通知</li>
            <li>昵称：您在平台上的公开显示名称</li>
            <li>头像：您上传的头像图片（可选）</li>
            <li>个人简介：您填写的个人介绍（可选）</li>
            <li>第三方账号标识：如果您通过 Google 等第三方账号登录，我们会收集该平台提供的唯一标识、邮箱、昵称和头像</li>
          </ul>
        </SubSection>

        <SubSection heading="1.2 您发布的内容">
          <p>当您使用我们的服务时，我们会存储您主动发布的内容，包括但不限于：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>短帖内容（文字、话题标签、提及的用户）</li>
            <li>长文内容（标题、正文、摘要、封面图片）</li>
            <li>您上传的图片和附件文件</li>
            <li>评论和回复内容</li>
            <li>私信内容（仅发送和接收双方可见）</li>
            <li>会议相关信息（会议标题、描述、参会人、聊天记录、纪要）</li>
          </ul>
        </SubSection>

        <SubSection heading="1.3 互动与行为数据">
          <p>我们会自动记录您与平台的互动行为，包括：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>点赞、收藏、转发记录</li>
            <li>关注与被关注关系</li>
            <li>文章阅读记录和浏览次数</li>
            <li>搜索历史（用于改进搜索体验）</li>
            <li>设备和日志信息（IP 地址、浏览器类型、访问时间、页面浏览路径）</li>
          </ul>
        </SubSection>

        <SubSection heading="1.4 通知与偏好设置">
          <p>我们会收集您的通知偏好设置，以确定是否向您发送特定类型的通知，例如：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>内容被点赞的通知开关</li>
            <li>内容被删除的通知开关</li>
            <li>私信和会议邀请通知</li>
          </ul>
        </SubSection>
      </Section>

      <Section heading="二、我们如何使用信息">
        <p>我们收集的信息将用于以下目的：</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>提供和维护服务</strong>：创建和管理您的账号，保障服务的正常运行和安全稳定</li>
          <li><strong>展示您发布的内容</strong>：将您的帖子和长文展示给其他用户，并在您的个人主页进行展示</li>
          <li><strong>个性化推荐</strong>：根据您的兴趣和行为，提供更相关的内容推荐和搜索结果</li>
          <li><strong>通知推送</strong>：向您发送互动通知、系统消息和安全提醒</li>
          <li><strong>社交互动</strong>：实现关注、私信、评论、转发等社交功能</li>
          <li><strong>安全与风控</strong>：检测和防范垃圾信息、恶意账号、网络攻击等违规行为</li>
          <li><strong>内容审核</strong>：对发布的内容进行合规审查，维护社区健康环境</li>
          <li><strong>改进服务</strong>：分析使用数据以优化产品功能和用户体验</li>
          <li><strong>法律合规</strong>：遵守适用的法律法规，回应合法的监管要求</li>
        </ul>
      </Section>

      <Section heading="三、信息的存储与安全">
        <SubSection heading="3.1 存储位置">
          <p>
            您的个人信息存储在位于安全数据中心的服务器上，我们采取严格的技术和管理措施保护您的数据安全。
          </p>
        </SubSection>

        <SubSection heading="3.2 安全措施">
          <p>我们采用以下措施保护您的信息安全：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>密码采用加盐哈希算法（bcrypt）加密存储，不可逆</li>
            <li>敏感操作需身份验证</li>
            <li>数据传输采用 HTTPS 加密</li>
            <li>严格的内部访问权限控制</li>
            <li>定期进行安全审计和漏洞扫描</li>
          </ul>
        </SubSection>

        <SubSection heading="3.3 存储期限">
          <p>
            我们仅在实现本政策所述目的所需的期限内保留您的个人信息。当您删除账号时，我们会在合理期限内删除或匿名化处理您的个人信息，法律法规另有规定的除外。
          </p>
        </SubSection>
      </Section>

      <Section heading="四、信息的共享与披露">
        <p>
          我们不会向第三方出售您的个人信息。仅在以下情况下，我们可能会共享您的信息：
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>经您同意</strong>：在获得您明确同意后，与第三方共享您指定的信息</li>
          <li><strong>公开内容</strong>：您主动公开发布的内容（帖子、长文、评论、个人资料等）对所有访问者可见</li>
          <li><strong>服务提供商</strong>：与我们合作的云服务、存储服务等供应商，仅在为您提供服务所必需的范围内访问数据</li>
          <li><strong>法律要求</strong>：根据适用的法律法规、法律程序、诉讼或政府主管部门的强制性要求</li>
          <li><strong>权利保护</strong>：为保护我们、您或其他用户的合法权益而有必要披露的情况</li>
        </ul>
      </Section>

      <Section heading="五、您的权利">
        <p>您对您的个人信息享有以下权利：</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>访问权</strong>：您可以在个人主页和设置页面查看您的个人信息和发布的内容</li>
          <li><strong>更正权</strong>：您可以随时修改您的昵称、头像、个人简介等个人资料</li>
          <li><strong>删除权</strong>：您可以删除自己发布的帖子、长文、评论等内容；如需注销账号，请联系管理员</li>
          <li><strong>撤回同意</strong>：您可以通过关闭通知设置等方式撤回对特定信息收集的同意</li>
          <li><strong>导出数据</strong>：您有权获取您的个人数据副本，如需导出请联系管理员</li>
        </ul>
      </Section>

      <Section heading="六、第三方服务">
        <p>
          我们的服务可能包含第三方提供的功能或链接（如 Google 登录、第三方图片资源等）。这些第三方有其独立的隐私政策，我们不对其活动承担责任。建议您在使用这些服务前查阅相应的隐私政策。
        </p>
      </Section>

      <Section heading="七、未成年人保护">
        <p>
          我们的服务面向成年用户。如果您是未成年人，请在监护人的陪同下阅读本政策并在监护人同意后使用我们的服务。我们不会主动收集未成年人的个人信息。
        </p>
      </Section>

      <Section heading="八、政策的变更">
        <p>
          我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，并标注更新日期。重大变更我们会通过站内通知等方式告知您。继续使用我们的服务即表示您同意更新后的政策。
        </p>
      </Section>

      <Section heading="九、联系我们">
        <p>
          如果您对本隐私政策有任何疑问、意见或建议，或者希望行使您的相关权利，请通过以下方式联系我们：
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>站内私信管理员账号</li>
          <li>通过平台提供的反馈渠道提交</li>
        </ul>
      </Section>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
