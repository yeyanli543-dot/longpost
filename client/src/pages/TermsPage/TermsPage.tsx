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

const TermsPage: React.FC = () => {
  return (
    <LegalPageLayout title="服务条款" lastUpdated="2026 年 9 月 18 日">
      <Section heading="欢迎使用 LongPost">
        <p>
          欢迎您使用 LongPost 服务。以下是您使用本服务所需遵守的条款，请您仔细阅读。使用 LongPost
          服务即表示您已阅读、理解并同意受本服务条款的约束。如果您不同意以下任何条款，请立即停止使用本服务。
        </p>
        <p>
          本服务条款构成您与 LongPost 之间关于使用本服务的完整协议。
        </p>
      </Section>

      <Section heading="一、服务说明">
        <p>
          LongPost 是一个长文发布与社交平台，允许用户发布短帖和长文、关注其他用户、进行互动评论、发送私信、发起在线会议等。我们保留随时修改、暂停或终止部分或全部服务的权利，恕不另行通知。
        </p>
      </Section>

      <Section heading="二、账号注册与使用">
        <SubSection heading="2.1 注册资格">
          <p>
            您确认您具备完全民事行为能力，并承诺提供真实、准确、完整的注册信息。您应对您的账号安全负责，并对您账号下的所有活动承担责任。
          </p>
        </SubSection>

        <SubSection heading="2.2 账号安全">
          <p>
            请妥善保管您的账号密码和登录凭证，不要将账号信息告知他人。如发现账号被盗用或存在安全漏洞，请立即修改密码并通知我们。因您个人原因导致的账号损失，由您自行承担。
          </p>
        </SubSection>

        <SubSection heading="2.3 账号注销">
          <p>
            如您不再使用我们的服务，可以申请注销账号。账号注销后，您的个人信息将被删除或匿名化处理，您发布的内容将根据平台规则保留或删除。
          </p>
        </SubSection>
      </Section>

      <Section heading="三、用户行为规范">
        <SubSection heading="3.1 禁止发布的内容">
          <p>您在使用本服务时，不得发布、传播以下内容：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>违反中华人民共和国法律法规的内容</li>
            <li>危害国家安全、泄露国家秘密、颠覆国家政权、破坏国家统一的内容</li>
            <li>宣扬恐怖主义、极端主义、民族仇恨、民族歧视的内容</li>
            <li>传播淫秽、色情、暴力、凶杀、恐怖或教唆犯罪的内容</li>
            <li>侮辱、诽谤他人，侵害他人合法权益的内容</li>
            <li>散布谣言、虚假信息，扰乱社会秩序的内容</li>
            <li>煽动非法集会、结社、游行、示威、聚众扰乱社会秩序的内容</li>
            <li>侵犯他人知识产权、商业秘密或其他合法权益的内容</li>
            <li>垃圾广告、恶意营销、诱导分享、诈骗信息</li>
            <li>含有计算机病毒、恶意代码或破坏性程序的内容</li>
            <li>其他违反公序良俗或平台规定的内容</li>
          </ul>
        </SubSection>

        <SubSection heading="3.2 禁止的行为">
          <p>您不得从事以下行为：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>冒用他人名义或账号发布内容</li>
            <li>批量注册账号、刷粉、刷赞、刷评论等作弊行为</li>
            <li>使用自动化工具或脚本大规模访问、抓取平台内容</li>
            <li>恶意攻击、干扰平台正常运行</li>
            <li>未经授权访问他人账号、私信或其他数据</li>
            <li>利用平台漏洞进行任何形式的利用或传播</li>
            <li>以任何方式损坏、禁用、影响平台服务的正常运行</li>
          </ul>
        </SubSection>
      </Section>

      <Section heading="四、内容权利与责任">
        <SubSection heading="4.1 内容归属">
          <p>
            用户在本平台发布的内容（包括但不限于短帖、长文、图片、评论、私信），其知识产权归用户本人所有。用户授予 LongPost
            在全球范围内免费的、非排他的、可再许可的使用权，用于在平台内展示、传播、推广您发布的内容，以及用于产品改进和服务优化。
          </p>
        </SubSection>

        <SubSection heading="4.2 内容责任">
          <p>
            用户对其发布的内容独立承担全部法律责任。因用户发布的内容侵犯任何第三方权益的，由该用户自行承担责任，与 LongPost
            无关。如因此给 LongPost 造成损失，用户应承担相应的赔偿责任。
          </p>
        </SubSection>

        <SubSection heading="4.3 知识产权">
          <p>
            LongPost 及其相关标识、界面设计、代码等均受知识产权法律保护。未经授权，任何人不得以任何形式复制、修改、传播或用于商业用途。
          </p>
        </SubSection>
      </Section>

      <Section heading="五、平台内容管理">
        <SubSection heading="5.1 内容审核">
          <p>
            我们有权对用户发布的内容进行审核，并根据本条款及相关法律法规，对违规内容采取删除、屏蔽、限制传播等处理措施。我们不保证所有内容均符合要求，也不承担因内容违规而产生的任何责任。
          </p>
        </SubSection>

        <SubSection heading="5.2 违规处理">
          <p>
            如用户违反本服务条款，我们有权根据情节轻重采取以下措施：
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>警告并要求改正</li>
            <li>删除或屏蔽违规内容</li>
            <li>限制账号功能（如禁言、限制发布）</li>
            <li>冻结或封禁账号</li>
            <li>向有关部门报告</li>
          </ul>
        </SubSection>

        <SubSection heading="5.3 用户举报">
          <p>
            用户如发现平台上存在违规内容，可以通过举报功能提交。我们会对举报进行核实处理，并对举报人信息予以保密。
          </p>
        </SubSection>
      </Section>

      <Section heading="六、会议与私信">
        <SubSection heading="6.1 视频会议">
          <p>
            平台提供在线视频会议功能。您应确保会议内容合法合规，不得利用会议功能从事任何违法违规活动。会议创建者对会议内容承担主要责任。
            平台不主动存储会议音视频数据，会议聊天记录和纪要由用户决定是否保存。
          </p>
        </SubSection>

        <SubSection heading="6.2 私信功能">
          <p>
            私信内容仅发送和接收双方可见。您不得利用私信功能发送垃圾信息、骚扰信息或违法违规内容。我们不会主动查看您的私信内容，但在接到举报或法律要求时有权进行核查。
          </p>
        </SubSection>
      </Section>

      <Section heading="七、免责声明">
        <SubSection heading="7.1 服务可用性">
          <p>
            我们会尽合理努力保障服务的稳定运行，但不对服务的可用性、连续性、及时性或可靠性作任何明示或暗示的担保。因不可抗力、系统故障、网络中断等原因导致的服务中断或数据丢失，我们不承担责任。
          </p>
        </SubSection>

        <SubSection heading="7.2 第三方内容">
          <p>
            平台上的内容由用户自主发布，不代表 LongPost 的观点或立场。您因依赖平台上的内容而做出的任何决定或采取的任何行动，由您自行承担风险。
          </p>
        </SubSection>

        <SubSection heading="7.3 链接与第三方服务">
          <p>
            平台可能包含指向第三方网站或服务的链接。我们对这些第三方网站或服务的内容、隐私政策或行为不承担责任。您访问第三方链接的风险由您自行承担。
          </p>
        </SubSection>
      </Section>

      <Section heading="八、服务变更与终止">
        <p>
          我们有权随时修改、暂停或终止本服务的全部或部分功能，且无需提前通知。您同意我们不对因服务变更或终止而对您或任何第三方造成的影响承担责任。
        </p>
      </Section>

      <Section heading="九、条款变更">
        <p>
          我们可能会不时更新本服务条款。更新后的条款将在本页面发布，并标注更新日期。重大变更我们会通过站内通知等方式告知您。继续使用我们的服务即表示您同意更新后的条款。
        </p>
      </Section>

      <Section heading="十、适用法律与争议解决">
        <p>
          本服务条款的订立、执行、解释及争议解决均适用中华人民共和国法律。如双方就本条款内容或其执行发生争议，双方应友好协商解决；协商不成的，任何一方均可向有管辖权的人民法院提起诉讼。
        </p>
      </Section>

      <Section heading="十一、联系我们">
        <p>
          如您对本服务条款有任何疑问、意见或建议，请通过以下方式联系我们：
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>站内私信管理员账号</li>
          <li>通过平台提供的反馈渠道提交</li>
        </ul>
      </Section>
    </LegalPageLayout>
  );
};

export default TermsPage;
