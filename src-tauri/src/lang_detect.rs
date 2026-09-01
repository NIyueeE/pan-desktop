use std::sync::LazyLock;

use lingua::{Language, LanguageDetector, LanguageDetectorBuilder};

/// 22-language detector, built once: lingua loads its language models on
/// construction, which is far too expensive to repeat per invocation.
///
/// Tuned for our consumers — the language badge and the dictionary card's
/// lookup language only; the translation chain never sees this result. The
/// 0.3 minimum relative distance makes ambiguous short input (a single word
/// like "test", valid in a dozen languages) report "unknown" instead of a
/// confident wrong answer. 0.4 was tried first but empirically rejects even
/// clear English sentences (the classic pangram comes back unknown), so 0.3
/// is the strictest threshold that never misfires on real sentences.
static DETECTOR: LazyLock<LanguageDetector> = LazyLock::new(|| {
    let languages = vec![
        Language::Chinese,
        Language::Japanese,
        Language::English,
        Language::Korean,
        Language::French,
        Language::Spanish,
        Language::German,
        Language::Russian,
        Language::Italian,
        Language::Portuguese,
        Language::Turkish,
        Language::Arabic,
        Language::Vietnamese,
        Language::Thai,
        Language::Indonesian,
        Language::Malay,
        Language::Hindi,
        Language::Mongolian,
        Language::Bokmal,
        Language::Nynorsk,
        Language::Persian,
        Language::Ukrainian,
    ];
    LanguageDetectorBuilder::from_languages(&languages)
        .with_minimum_relative_distance(0.3)
        .build()
});

/// ISO-ish code for the badge / dictionary language, or "" when unknown.
fn detect_language(text: &str) -> String {
    DETECTOR
        .detect_language_of(text)
        .map_or_else(String::new, |lang| {
            match lang {
                Language::Chinese => "zh_cn",
                Language::Japanese => "ja",
                Language::English => "en",
                Language::Korean => "ko",
                Language::French => "fr",
                Language::Spanish => "es",
                Language::German => "de",
                Language::Russian => "ru",
                Language::Italian => "it",
                Language::Portuguese => "pt_pt",
                Language::Turkish => "tr",
                Language::Arabic => "ar",
                Language::Vietnamese => "vi",
                Language::Thai => "th",
                Language::Indonesian => "id",
                Language::Malay => "ms",
                Language::Hindi => "hi",
                Language::Mongolian => "mn_cy",
                Language::Bokmal => "nb_no",
                Language::Nynorsk => "nn_no",
                Language::Persian => "fa",
                Language::Ukrainian => "uk",
            }
            .to_string()
        })
}

/// CPU-bound language detection: run on the blocking pool so no runtime
/// worker stalls (AGENTS.md §8). The frontend treats "" as unknown — the
/// badge hides and the dictionary falls back to English.
#[tauri::command]
pub async fn lang_detect(text: String) -> String {
    tauri::async_runtime::spawn_blocking(move || detect_language(&text))
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::detect_language;

    #[test]
    fn detects_clear_sentences() {
        assert_eq!(
            detect_language("The quick brown fox jumps over the lazy dog."),
            "en"
        );
        assert_eq!(
            detect_language("今天天气非常好，我们一起去公园散步吧。"),
            "zh_cn"
        );
        assert_eq!(
            detect_language("Bonjour, comment allez-vous aujourd'hui ?"),
            "fr"
        );
        assert_eq!(detect_language("こんにちは、今日はいい天気ですね。"), "ja");
    }

    #[test]
    fn ambiguous_single_words_report_unknown() {
        // "test" is a valid word in many languages; with the relative
        // distance threshold lingua must report unknown instead of a
        // confident wrong guess (it used to come back Italian).
        assert_eq!(detect_language("test"), "");
        assert_eq!(detect_language("hello"), "");
        assert_eq!(detect_language("chair"), "");
    }

    #[test]
    fn empty_and_uninformative_input_report_unknown() {
        assert_eq!(detect_language(""), "");
        assert_eq!(detect_language("12345 !!!"), "");
    }
}
