<?php
defined('ABSPATH') || exit;

/* ─── Main renderer ─────────────────────────────────────────────── */

function bkdn_render_page(array $page): string {
    $opt     = bkdn_get_options();
    $theme   = $page['theme'] ?? bkdn_default_theme();
    $buttons = $page['buttons'] ?? [];

    // Guarantee Instagram + Facebook always appear — hardcoded fallback if options empty
    $ig_url = !empty($opt['instagram_url']) ? $opt['instagram_url'] : 'https://www.instagram.com/bakudanramen/';
    $fb_url = !empty($opt['facebook_url'])  ? $opt['facebook_url']  : 'https://www.facebook.com/share/1DtztAQpcV/?mibextid=wwXIfr';
    $icon_keys_present = array_column($buttons, 'icon_key');
    if (!in_array('instagram', $icon_keys_present)) {
        $buttons[] = [
            'id' => 0, 'title' => 'Instagram', 'subtitle' => '@bakudanramen',
            'icon_key' => 'instagram', 'url' => $ig_url,
            'style_variant' => 'secondary', 'sort_order' => 50,
            'enabled' => 1, 'is_active' => 1, 'opens_in_new_tab' => 1,
        ];
    }
    if (!in_array('facebook', $icon_keys_present)) {
        $buttons[] = [
            'id' => 0, 'title' => 'Facebook', 'subtitle' => 'Bakudan Ramen',
            'icon_key' => 'facebook', 'url' => $fb_url,
            'style_variant' => 'secondary', 'sort_order' => 60,
            'enabled' => 1, 'is_active' => 1, 'opens_in_new_tab' => 1,
        ];
    }
    usort($buttons, fn($a, $b) => (int)($a['sort_order'] ?? 0) <=> (int)($b['sort_order'] ?? 0));

    // Partition — is_active=0 already excluded by SQL.
    // enabled=0 on primary/order_sub = skip entirely.
    // enabled=0 on link rows = render as visible-disabled (greyed out).
    $primary    = null;
    $order_subs = [];
    $rows       = [];

    foreach ($buttons as $btn) {
        $style      = $btn['style_variant'];
        $is_enabled = (bool)($btn['enabled'] ?? 1);
        if ($style === 'primary')   { if ($is_enabled) $primary = $btn; continue; }
        if ($style === 'order_sub') { if ($is_enabled) $order_subs[] = $btn; continue; }
        $rows[] = $btn; // secondary rows kept even if enabled=0 (shows as disabled)
    }

    // Theme tokens
    $bg      = esc_attr($theme['bg_color']             ?? '#0a0a0a');
    $card    = esc_attr($theme['card_color']            ?? '#141414');
    $accent  = esc_attr($theme['accent_color']         ?? '#B91C1C');
    $accentD = esc_attr($theme['button_primary_color']  ?? '#B91C1C');
    $border  = esc_attr($theme['border_color']          ?? '#262626');
    $textPri = esc_attr($theme['text_primary']          ?? '#ffffff');
    $textSec = esc_attr($theme['text_secondary']        ?? '#888888');

    $title    = esc_html($page['title']       ?? 'Bakudan Ramen');
    $headline = esc_html($page['headline']    ?? 'BAKUDAN RAMEN');
    $sub      = esc_html($page['subheadline'] ?? '');
    $seo_desc = esc_attr($page['seo_desc']    ?? '');
    $canonical = esc_url(home_url('/links/' . $page['slug']));

    $show_signup   = (bool)$opt['signup_form_enabled'];
    $signup_cta    = esc_html($opt['signup_cta_text'] ?: 'Get specials & menu drops');
    $signup_incentive = esc_html($opt['signup_incentive'] ?? '');
    $page_id_js    = (int)$page['id'];
    $rest_root     = esc_url(rest_url('bkdn/v1'));

    ob_start();
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="<?php echo $seo_desc; ?>">
<meta property="og:title"       content="<?php echo esc_attr($page['title'] ?? ''); ?>">
<meta property="og:description" content="<?php echo $seo_desc; ?>">
<meta property="og:url"         content="<?php echo $canonical; ?>">
<?php if (!empty($page['og_image_path'])): ?>
<meta property="og:image" content="<?php echo esc_url($page['og_image_path']); ?>">
<?php endif; ?>
<meta name="robots" content="index, follow">
<link rel="canonical" href="<?php echo $canonical; ?>">
<title><?php echo $title; ?></title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Helvetica,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:<?php echo $bg; ?>;color:<?php echo $textPri; ?>;min-height:100vh;
  padding:48px 20px 80px;-webkit-font-smoothing:antialiased;}
a{text-decoration:none;color:inherit}
button{font-family:inherit;cursor:pointer}
.wrap{max-width:460px;margin:0 auto}

@keyframes bkdn-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.s{animation:bkdn-up .5s ease-out both}
<?php for ($i=1;$i<=15;$i++): ?>.s:nth-child(<?php echo $i; ?>){animation-delay:<?php printf('%.2f', ($i-1)*0.07); ?>s}
<?php endfor; ?>

/* hero */
.hero{text-align:center;margin-bottom:36px}
.logo-circle{width:88px;height:88px;margin:0 auto 18px;background:<?php echo $accent; ?>;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:700;
  color:#fff;border:3px solid <?php echo $accentD; ?>;line-height:1;}
.hero h1{font-size:24px;font-weight:700;letter-spacing:2px;color:<?php echo $textPri; ?>;margin:0 0 6px}
.divider{width:40px;height:2px;background:<?php echo $accent; ?>;margin:8px auto 10px}
.hero p{font-size:11px;color:<?php echo $textSec; ?>;letter-spacing:1.5px;text-transform:uppercase}

/* featured badge */
.featured-badge{display:inline-block;background:<?php echo $accent; ?>;color:#fff;
  font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 6px;border-radius:3px;
  text-transform:uppercase;margin-bottom:6px}

/* primary CTA */
.cta-wrap{margin-bottom:10px}
.cta-btn{display:block;width:100%;background:<?php echo $accent; ?>;color:#fff;
  padding:18px 20px;border-radius:12px;font-weight:700;font-size:16px;
  text-align:center;letter-spacing:.5px;border:none;transition:background .15s;
  border-bottom-left-radius:12px;border-bottom-right-radius:12px;}
.cta-btn:hover{background:<?php echo $accentD; ?>}
.cta-btn.open{border-bottom-left-radius:4px;border-bottom-right-radius:4px}
.cta-sub{display:block;font-size:11px;font-weight:400;opacity:.85;margin-top:5px;letter-spacing:.2px}

/* order subs */
.order-panel{overflow:hidden;transition:max-height .35s ease-out;margin-bottom:10px}
.order-inner{padding:4px 0 0;display:grid;gap:6px}
.order-sub-btn{background:#2a0808;border:1px solid #6B1010;border-radius:8px;
  padding:14px 6px;text-align:center;color:#fff;display:block;
  font-size:13px;font-weight:700;letter-spacing:.5px;transition:background .15s,border-color .15s;}
.order-sub-btn:hover{background:#3a1010;border-color:#8B1313}
.order-sub-hint{display:block;font-size:10px;font-weight:400;color:#c08080;margin-top:3px}

/* link rows */
.link-row{display:flex;align-items:center;background:<?php echo $card; ?>;color:<?php echo $textPri; ?>;
  padding:15px 18px;border-radius:12px;margin-bottom:10px;border:1px solid <?php echo $border; ?>;
  font-weight:500;font-size:14px;transition:background .15s,border-color .15s,transform .1s;min-height:60px;}
.link-row:hover{background:#1c1c1c;border-color:<?php echo $accent; ?>;transform:translateX(2px)}
.link-row.disabled{opacity:.4;cursor:default;pointer-events:none}
.link-icon{display:inline-flex;width:36px;height:36px;background:<?php echo $accent; ?>;
  border-radius:8px;align-items:center;justify-content:center;margin-right:14px;color:#fff;flex-shrink:0;}
.link-title{font-size:14px;font-weight:600;line-height:1.3}
.link-sub{color:<?php echo $textSec; ?>;font-size:12px;font-weight:400;margin-top:2px}

/* coming soon */
.coming-soon{background:#0f0f0f;color:#555;padding:14px 20px;border-radius:12px;
  margin-bottom:10px;border:1px dashed #222;font-weight:500;font-size:13px;text-align:center;}

/* signup form */
.signup-section{background:<?php echo $card; ?>;border:1px solid <?php echo $border; ?>;
  border-radius:12px;padding:20px;margin-bottom:10px;text-align:center;}
.signup-section h3{font-size:14px;font-weight:700;margin-bottom:6px}
.signup-section p{font-size:12px;color:<?php echo $textSec; ?>;margin-bottom:14px}
.signup-form{display:flex;gap:8px;flex-wrap:wrap}
.signup-input{flex:1;min-width:160px;background:#1a1a1a;border:1px solid <?php echo $border; ?>;
  border-radius:8px;padding:12px 14px;color:<?php echo $textPri; ?>;font-size:14px;outline:none;}
.signup-input:focus{border-color:<?php echo $accent; ?>}
.signup-btn{background:<?php echo $accent; ?>;color:#fff;border:none;border-radius:8px;
  padding:12px 18px;font-size:14px;font-weight:700;white-space:nowrap;transition:background .15s;}
.signup-btn:hover{background:<?php echo $accentD; ?>}
.signup-msg{margin-top:10px;font-size:13px;display:none}
.signup-msg.ok{color:#4ade80;display:block}
.signup-msg.err{color:#f87171;display:block}

/* footer */
.footer{text-align:center;border-top:1px solid #181818;padding-top:20px;margin-top:12px}
.footer p{color:#444;font-size:11px;margin-bottom:3px}
</style>
</head>
<body>
<div class="wrap">

  <!-- Hero -->
  <div class="s hero">
    <?php if (!empty($page['logo_path'])): ?>
    <div class="logo-circle" style="padding:0;overflow:hidden" aria-hidden="true">
      <img src="<?php echo esc_url($page['logo_path']); ?>" alt="" style="width:100%;height:100%;object-fit:cover">
    </div>
    <?php else: ?>
    <div class="logo-circle" aria-hidden="true">爆</div>
    <?php endif; ?>
    <h1><?php echo $headline; ?></h1>
    <div class="divider"></div>
    <p><?php echo $sub; ?></p>
  </div>

  <?php if ($primary): ?>
  <!-- Primary CTA -->
  <div class="s cta-wrap">
    <?php
    $has_subs = !empty($order_subs);
    $is_featured = !empty($primary['is_featured']);
    $p_title = esc_html($primary['title']);
    $p_sub   = esc_html($primary['subtitle'] ?? 'Pickup · Delivery · Catering');
    $p_href  = esc_url($primary['url'] ?? '#');
    $p_bid   = (int)($primary['id'] ?? 0);
    ?>
    <?php if ($is_featured): ?>
    <div class="featured-badge">⭐ Featured</div>
    <?php endif; ?>
    <?php if (!$has_subs): ?>
    <a class="cta-btn" href="<?php echo $p_href; ?>"
       data-bid="<?php echo $p_bid; ?>"
       <?php echo !empty($primary['opens_in_new_tab']) ? 'target="_blank" rel="noopener noreferrer"' : ''; ?>>
      <?php echo $p_title; ?><span class="cta-sub"><?php echo $p_sub; ?></span>
    </a>
    <?php else: ?>
    <button class="cta-btn" id="bkdn-order-btn" aria-expanded="false" onclick="bkdnToggle()" data-bid="<?php echo $p_bid; ?>">
      <?php echo $p_title; ?><span class="cta-sub"><?php echo $p_sub; ?></span>
    </button>
    <div class="order-panel" id="bkdn-order-panel" style="max-height:0">
      <div class="order-inner" style="grid-template-columns:repeat(<?php echo count($order_subs); ?>,1fr)">
        <?php foreach ($order_subs as $sub_btn): ?>
        <a class="order-sub-btn"
           href="<?php echo esc_url($sub_btn['url'] ?? '#'); ?>"
           data-bid="<?php echo (int)$sub_btn['id']; ?>"
           target="_blank" rel="noopener noreferrer">
          <?php echo esc_html($sub_btn['title']); ?>
          <span class="order-sub-hint"><?php echo esc_html($sub_btn['subtitle'] ?? 'Order now'); ?></span>
        </a>
        <?php endforeach; ?>
      </div>
    </div>
    <?php endif; ?>
  </div>
  <?php endif; ?>

  <!-- Link rows -->
  <?php foreach ($rows as $row):
    $style = $row['style_variant'];
    if ($style === 'coming_soon'):
  ?>
  <div class="s coming-soon"><?php echo esc_html($row['title']); ?></div>
  <?php else:
    $has_url    = !empty($row['url']) && $row['url'] !== '#';
    $is_enabled = (bool)($row['enabled'] ?? 1);
    $disabled   = !$is_enabled || !$has_url;
    $href       = $has_url ? esc_url($row['url']) : '#';
    $newtab     = (!$disabled && !empty($row['opens_in_new_tab'])) ? ' target="_blank" rel="noopener noreferrer"' : '';
    $cls        = 'link-row' . ($disabled ? ' disabled' : '');
    $svg        = !empty($row['custom_icon_svg']) ? $row['custom_icon_svg'] : bkdn_svg($row['icon_key'] ?? '');
    $bid        = (int)($row['id'] ?? 0);
    $is_feat    = !empty($row['is_featured']);
  ?>
  <?php if ($disabled): ?>
  <div class="s <?php echo $cls; ?>">
  <?php else: ?>
  <a class="s <?php echo $cls; ?>" href="<?php echo $href; ?>"<?php echo $newtab; ?> data-bid="<?php echo $bid; ?>">
  <?php endif; ?>
    <span class="link-icon"><?php echo $svg; ?></span>
    <div style="flex:1;min-width:0">
      <?php if ($is_feat): ?><div class="featured-badge" style="margin-bottom:4px">Featured</div><?php endif; ?>
      <div class="link-title"><?php echo esc_html($row['title']); ?></div>
      <?php if (!empty($row['subtitle'])): ?>
      <div class="link-sub"><?php echo esc_html($row['subtitle']); ?></div>
      <?php endif; ?>
    </div>
  <?php echo $disabled ? '</div>' : '</a>'; ?>
  <?php endif; endforeach; ?>

  <!-- Email signup (optional, toggle-controlled) -->
  <?php if ($show_signup): ?>
  <div class="s signup-section">
    <h3><?php echo $signup_cta; ?></h3>
    <?php if ($signup_incentive): ?><p><?php echo $signup_incentive; ?></p><?php endif; ?>
    <form class="signup-form" id="bkdn-signup" onsubmit="bkdnSubscribe(event)">
      <input class="signup-input" type="email" name="email" placeholder="Your email" required autocomplete="email">
      <button class="signup-btn" type="submit">Subscribe</button>
    </form>
    <div class="signup-msg" id="bkdn-signup-msg"></div>
  </div>
  <?php endif; ?>

  <!-- Footer -->
  <div class="s footer">
    <p>© <?php echo date('Y'); ?> Bakudan Ramen</p>
    <p>bakudanramen.com</p>
  </div>

</div>
<script>
var BKDN = { pageId: <?php echo $page_id_js; ?>, rest: '<?php echo $rest_root; ?>', nonce: '<?php echo esc_js(wp_create_nonce('wp_rest')); ?>' };

/* track page view */
(function(){
  fetch(BKDN.rest+'/track',{method:'POST',headers:{'Content-Type':'application/json','X-WP-Nonce':BKDN.nonce},
    body:JSON.stringify({type:'view',page_id:BKDN.pageId,ref:document.referrer,
      utm_source:new URLSearchParams(location.search).get('utm_source'),
      utm_medium:new URLSearchParams(location.search).get('utm_medium'),
      utm_campaign:new URLSearchParams(location.search).get('utm_campaign')})
  }).catch(function(){});
})();

/* track clicks */
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-bid]');
  if(!el) return;
  var bid=parseInt(el.dataset.bid,10);
  if(!bid) return;
  fetch(BKDN.rest+'/track',{method:'POST',headers:{'Content-Type':'application/json','X-WP-Nonce':BKDN.nonce},
    body:JSON.stringify({type:'click',page_id:BKDN.pageId,button_id:bid})
  }).catch(function(){});
});

/* expandable Order CTA */
function bkdnToggle(){
  var btn=document.getElementById('bkdn-order-btn');
  var panel=document.getElementById('bkdn-order-panel');
  var open=btn.getAttribute('aria-expanded')==='true';
  if(open){panel.style.maxHeight='0';btn.setAttribute('aria-expanded','false');btn.classList.remove('open');}
  else{panel.style.maxHeight=panel.scrollHeight+'px';btn.setAttribute('aria-expanded','true');btn.classList.add('open');}
}

/* email signup */
function bkdnSubscribe(e){
  e.preventDefault();
  var form=e.target, msg=document.getElementById('bkdn-signup-msg');
  var email=form.email.value;
  fetch(BKDN.rest+'/subscribe',{method:'POST',headers:{'Content-Type':'application/json','X-WP-Nonce':BKDN.nonce},
    body:JSON.stringify({email:email,source_page_id:BKDN.pageId})
  }).then(function(r){return r.json();}).then(function(d){
    msg.className='signup-msg '+(d.success?'ok':'err');
    msg.textContent=d.success?'You\'re in! 🎉 Watch your inbox.':d.message||'Something went wrong.';
    if(d.success) form.reset();
  }).catch(function(){
    msg.className='signup-msg err';msg.textContent='Network error, please try again.';
  });
}
</script>
</body>
</html>
    <?php
    return ob_get_clean();
}

/* ─── 404 page ────────────────────────────────────────────────────── */

function bkdn_render_404(): string {
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Found — Bakudan Ramen</title>
<style>body{font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#B91C1C}</style>
</head><body><div><div style="font-size:64px;margin-bottom:16px">爆</div>
<h1 style="font-size:22px;margin-bottom:12px">Page Not Found</h1>
<p style="color:#555;margin-bottom:24px">That link page doesn\'t exist.</p>
<a href="'.esc_url(home_url('/links')).'">← Back to all locations</a></div></body></html>';
}
